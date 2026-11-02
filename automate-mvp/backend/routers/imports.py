import json
import mimetypes
import os
import uuid
from io import BytesIO
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from auth import ADMIN_USERNAME, admin_required
from database import get_db
from import_service import (
    duplicate_issues,
    extract_ocr_fields,
    new_legacy_reg_no,
    normalize_record,
    parse_scanned_document,
    parse_spreadsheet,
)
from models import ImportBatch, ImportRow, Student

router = APIRouter(
    prefix="/api/admin/imports",
    tags=["admin imports"],
    dependencies=[Depends(admin_required)],
)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_SCAN_BYTES = 20 * 1024 * 1024
ARCHIVE_DIR = Path(os.getenv("IMPORT_ARCHIVE_DIR", Path(__file__).resolve().parents[1] / "import_archive")).expanduser().resolve()
EDITABLE_FIELDS = {
    "reg_no", "candidate_id", "full_name", "email", "phone", "category",
    "department_slug", "amount", "paid", "paid_at",
}


def _json(value):
    return json.dumps(value, default=str, ensure_ascii=False)


def _data(row):
    return json.loads(row.data_json)


def _revalidate(db, row):
    data, issues, warnings = normalize_record(_data(row), db)
    issues.extend(duplicate_issues(db, data, exclude_row_id=row.id))
    row.data_json = _json(data)
    row.issues_json = _json(list(dict.fromkeys(issues)))
    row.warnings_json = _json(warnings)
    return data, issues


def _row_out(row):
    return {
        "id": row.id,
        "row_number": row.row_number,
        "data": _data(row),
        "issues": json.loads(row.issues_json),
        "warnings": json.loads(row.warnings_json),
        "status": row.status,
        "created_student_id": row.created_student_id,
        "source_text": row.source_text,
    }


def _batch_out(db, batch):
    rows = db.query(ImportRow).filter(ImportRow.batch_id == batch.id).order_by(ImportRow.row_number).all()
    return {
        "id": batch.id,
        "source_type": batch.source_type,
        "original_filename": batch.original_filename,
        "document_url": f"/api/admin/imports/{batch.id}/document" if batch.document_key else None,
        "status": batch.status,
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "rows": [_row_out(row) for row in rows],
    }


def _make_student(db, batch, row, data, reviewer):
    if not data.get("reg_no"):
        data["reg_no"] = new_legacy_reg_no(db)
    student = Student(
        reg_no=data["reg_no"],
        candidate_id=data.get("candidate_id") or f"legacy-import:{batch.id}:{row.id}",
        department_slug=data["department_slug"],
        category=data["category"],
        full_name=data["full_name"],
        email=data["email"],
        phone=data["phone"],
        extra_json=_json(data.get("extra") or {}),
        amount=int(data["amount"]),
        paid=1 if data.get("paid") else 0,
        paystack_ref=None,
        paid_at=data.get("paid_at") if data.get("paid") else None,
        source_document_key=batch.document_key,
    )
    db.add(student)
    db.flush()
    row.status = "imported"
    row.created_student_id = student.id
    row.reviewed_by = reviewer
    row.reviewed_at = datetime.utcnow()
    return student


def _refresh_batch_status(db, batch):
    rows = db.query(ImportRow).filter(ImportRow.batch_id == batch.id).all()
    if rows and all(row.status in {"imported", "skipped"} for row in rows):
        batch.status = "complete"
    else:
        batch.status = "preview"


def _new_batch(db, username, source_type, filename, document_key=None):
    batch = ImportBatch(
        source_type=source_type,
        original_filename=filename[:255],
        created_by=username,
        status="preview",
        document_key=document_key,
    )
    db.add(batch)
    db.flush()
    return batch


def _add_rows(db, batch, raw_rows):
    for index, raw in enumerate(raw_rows, start=2):
        data, issues, warnings = normalize_record(raw, db)
        row = ImportRow(
            batch_id=batch.id,
            row_number=index,
            raw_json=_json(raw),
            data_json=_json(data),
            issues_json=_json(issues),
            warnings_json=_json(warnings),
            status="pending_review",
        )
        db.add(row)
        db.flush()
        issues.extend(duplicate_issues(db, data, exclude_row_id=row.id))
        row.issues_json = _json(list(dict.fromkeys(issues)))


def _revalidate_batch(db, batch):
    rows = db.query(ImportRow).filter(
        ImportRow.batch_id == batch.id,
        ImportRow.status == "pending_review",
    ).order_by(ImportRow.row_number).all()
    for row in rows:
        _revalidate(db, row)


def _add_scan_rows(db, batch, page_texts):
    for page_number, text in enumerate(page_texts, start=1):
        raw = extract_ocr_fields(text)
        data, issues, warnings = normalize_record(raw, db)
        row = ImportRow(
            batch_id=batch.id,
            row_number=page_number,
            raw_json=_json(raw),
            data_json=_json(data),
            issues_json=_json(issues),
            warnings_json=_json(warnings),
            source_text=text,
            status="pending_review",
        )
        db.add(row)
        db.flush()
        issues.extend(duplicate_issues(db, data, exclude_row_id=row.id))
        row.issues_json = _json(list(dict.fromkeys(issues)))


def _document_path(document_key):
    if not document_key or Path(document_key).name != document_key:
        raise HTTPException(status_code=404, detail="Archived document not found.")
    path = (ARCHIVE_DIR / document_key).resolve()
    if path.parent != ARCHIVE_DIR or not path.is_file():
        raise HTTPException(status_code=404, detail="Archived document not found.")
    return path


@router.post("/files")
async def upload_spreadsheet(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File size must be 10 MB or less.")
    try:
        raw_rows = parse_spreadsheet(file.filename or "upload", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    batch = _new_batch(db, ADMIN_USERNAME, "spreadsheet", file.filename or "upload")
    _add_rows(db, batch, raw_rows)
    _revalidate_batch(db, batch)
    _refresh_batch_status(db, batch)
    db.commit()
    return _batch_out(db, batch)


@router.post("/scans")
async def upload_scan(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    filename = Path(file.filename or "scan").name
    content = await file.read(MAX_SCAN_BYTES + 1)
    if len(content) > MAX_SCAN_BYTES:
        raise HTTPException(status_code=413, detail="Scanned files must be 20 MB or less.")
    try:
        page_texts = parse_scanned_document(filename, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    document_key = f"{uuid.uuid4().hex}{Path(filename).suffix.lower()}"
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    archive_path = ARCHIVE_DIR / document_key
    try:
        with archive_path.open("xb") as archived:
            archived.write(content)
        batch = _new_batch(db, ADMIN_USERNAME, "scan", filename, document_key)
        _add_scan_rows(db, batch, page_texts)
        _refresh_batch_status(db, batch)
        db.commit()
    except Exception:
        db.rollback()
        archive_path.unlink(missing_ok=True)
        raise
    return _batch_out(db, batch)


@router.get("")
def list_batches(db: Session = Depends(get_db)):
    batches = db.query(ImportBatch).order_by(ImportBatch.created_at.desc()).limit(50).all()
    result = []
    for batch in batches:
        result.append({
            "id": batch.id,
            "source_type": batch.source_type,
            "original_filename": batch.original_filename,
            "document_url": f"/api/admin/imports/{batch.id}/document" if batch.document_key else None,
            "status": batch.status,
            "created_at": batch.created_at.isoformat() if batch.created_at else None,
            "row_count": db.query(ImportRow).filter(ImportRow.batch_id == batch.id).count(),
            "pending_count": db.query(ImportRow).filter(
                ImportRow.batch_id == batch.id,
                ImportRow.status == "pending_review",
            ).count(),
        })
    return result


@router.get("/{batch_id}")
def get_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found.")
    return _batch_out(db, batch)


@router.get("/{batch_id}/document")
def get_batch_document(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found.")
    path = _document_path(batch.document_key)
    return FileResponse(path, media_type=mimetypes.guess_type(batch.original_filename)[0] or "application/octet-stream")


@router.get("/{batch_id}/preview")
def get_batch_preview(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found.")
    if Path(batch.original_filename).suffix.lower() == ".pdf":
        raise HTTPException(status_code=400, detail="PDF previews use the original document endpoint.")
    path = _document_path(batch.document_key)
    try:
        from PIL import Image

        with Image.open(path) as source:
            with source.convert("RGB") as preview:
                output = BytesIO()
                preview.save(output, format="PNG")
    except Exception as exc:
        raise HTTPException(status_code=415, detail="Could not render this image preview.") from exc
    return Response(content=output.getvalue(), media_type="image/png")


@router.get("/students/{student_id}/document")
def get_student_document(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student or not student.source_document_key:
        raise HTTPException(status_code=404, detail="No archived source document is linked to this student.")
    batch = db.query(ImportBatch).filter(ImportBatch.document_key == student.source_document_key).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Archived document record not found.")
    path = _document_path(student.source_document_key)
    return FileResponse(path, media_type=mimetypes.guess_type(batch.original_filename)[0] or "application/octet-stream")


@router.put("/rows/{row_id}")
def update_row(row_id: int, payload: dict, db: Session = Depends(get_db)):
    row = db.query(ImportRow).filter(ImportRow.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Import row not found.")
    if row.status in {"imported", "skipped"}:
        raise HTTPException(status_code=409, detail="This row is no longer editable.")
    incoming = payload.get("data")
    if not isinstance(incoming, dict):
        raise HTTPException(status_code=400, detail="A data object is required.")
    data = _data(row)
    for field in EDITABLE_FIELDS:
        if field in incoming:
            data[field] = incoming[field]
    row.data_json = _json(data)
    _revalidate(db, row)
    row.reviewed_by = ADMIN_USERNAME
    row.reviewed_at = datetime.utcnow()
    db.commit()
    return _row_out(row)


@router.post("/rows/{row_id}/skip")
def skip_row(row_id: int, db: Session = Depends(get_db)):
    row = db.query(ImportRow).filter(ImportRow.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Import row not found.")
    if row.status == "imported":
        raise HTTPException(status_code=409, detail="An imported student cannot be skipped.")
    row.status = "skipped"
    row.reviewed_by = ADMIN_USERNAME
    row.reviewed_at = datetime.utcnow()
    batch = db.query(ImportBatch).filter(ImportBatch.id == row.batch_id).first()
    _refresh_batch_status(db, batch)
    db.commit()
    return _row_out(row)


@router.post("/rows/{row_id}/approve")
def approve_row(row_id: int, db: Session = Depends(get_db)):
    row = db.query(ImportRow).filter(ImportRow.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Import row not found.")
    if row.status != "pending_review":
        raise HTTPException(status_code=409, detail="This row is no longer awaiting approval.")
    batch = db.query(ImportBatch).filter(ImportBatch.id == row.batch_id).first()
    if batch.source_type != "scan":
        raise HTTPException(status_code=400, detail="Individual approval is reserved for scanned records.")
    data, issues = _revalidate(db, row)
    if issues:
        raise HTTPException(status_code=409, detail={"message": "Fix validation issues before approving this row.", "issues": issues})
    try:
        _make_student(db, batch, row, data, ADMIN_USERNAME)
        _refresh_batch_status(db, batch)
        db.commit()
    except Exception as exc:
        db.rollback()
        if "IntegrityError" in type(exc).__name__:
            raise HTTPException(status_code=409, detail="A record changed or duplicated during approval. Refresh and review it again.") from exc
        raise
    return _row_out(row)


@router.post("/{batch_id}/import")
def import_valid_rows(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found.")
    if batch.source_type == "scan":
        raise HTTPException(status_code=400, detail="Scanned records require individual review and approval.")
    rows = db.query(ImportRow).filter(
        ImportRow.batch_id == batch.id,
        ImportRow.status == "pending_review",
    ).order_by(ImportRow.row_number).all()
    ready = []
    blocked = []
    for row in rows:
        data, issues = _revalidate(db, row)
        if issues:
            blocked.append({"row_number": row.row_number, "issues": issues})
        else:
            ready.append((row, data))
    if not ready:
        db.commit()
        return {"imported": 0, "blocked": blocked, "batch": _batch_out(db, batch)}

    try:
        for row, data in ready:
            _make_student(db, batch, row, data, ADMIN_USERNAME)
        _refresh_batch_status(db, batch)
        db.commit()
    except Exception as exc:
        db.rollback()
        if "IntegrityError" in type(exc).__name__:
            raise HTTPException(status_code=409, detail="A record changed or duplicated during import. Refresh the batch and review it again.") from exc
        raise
    return {"imported": len(ready), "blocked": blocked, "batch": _batch_out(db, batch)}


