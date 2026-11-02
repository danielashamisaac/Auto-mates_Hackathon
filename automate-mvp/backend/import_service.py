import csv
import io
import json
import re
import secrets
import string
from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Department, ImportRow, Student


MAX_ROWS = 1000
FIELD_ALIASES = {
    "reg_no": {"reg_no", "registration_no", "registration_number", "reg_number", "reference", "registration reference"},
    "candidate_id": {"candidate_id", "candidateid", "candidate id"},
    "full_name": {"full_name", "fullname", "student_name", "name", "full name", "student name", "applicant name"},
    "email": {"email", "email_address", "email address"},
    "phone": {"phone", "phone_number", "mobile", "mobile_number", "phone number", "mobile number"},
    "category": {"category", "student_category", "student_type", "student category", "student type"},
    "department": {"department", "department_name", "department_slug", "program", "course", "department name"},
    "amount": {"amount", "fee", "registration_fee", "amount_paid", "registration fee", "amount paid"},
    "paid": {"paid", "payment_status", "status", "payment status"},
    "paid_at": {"paid_at", "payment_date", "date_paid", "payment date", "date paid"},
}


def _header(value):
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def parse_spreadsheet(filename, content):
    extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if extension == "csv":
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("CSV must use UTF-8 encoding.") from exc
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise ValueError("The CSV file must include a header row.")
        rows = list(reader)
    elif extension == "xlsx":
        try:
            from openpyxl import load_workbook

            workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            try:
                sheet = workbook.active
                if sheet.max_row and sheet.max_row > MAX_ROWS + 1:
                    raise ValueError(f"A batch can contain at most {MAX_ROWS} records.")
                values = sheet.iter_rows(values_only=True)
                headers = next(values, None)
                if not headers:
                    raise ValueError("The workbook must include a header row.")
                if len(headers) > 100:
                    raise ValueError("The workbook can contain at most 100 columns.")
                names = [str(value or "").strip() for value in headers]
                normalized_names = [_header(name) for name in names]
                if not all(normalized_names) or len(set(normalized_names)) != len(normalized_names):
                    raise ValueError("Column headers must be non-empty and unique.")
                rows = []
                for values_row in values:
                    if not any(value is not None for value in values_row):
                        continue
                    if len(rows) >= MAX_ROWS:
                        raise ValueError(f"A batch can contain at most {MAX_ROWS} records.")
                    rows.append(dict(zip(names, values_row)))
            finally:
                workbook.close()
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("Could not read this .xlsx workbook.") from exc
    else:
        raise ValueError("Upload a .csv or .xlsx file. Legacy .xls files are not supported.")

    if len(rows) > MAX_ROWS:
        raise ValueError(f"A batch can contain at most {MAX_ROWS} records.")
    if not rows:
        raise ValueError("No data rows were found in the file.")
    return rows


def parse_scanned_document(filename, content):
    extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if extension not in {"pdf", "png", "jpg", "jpeg", "tif", "tiff", "webp"}:
        raise ValueError("Upload a PDF or image file (PNG, JPG, TIFF, or WEBP).")
    try:
        import fitz
        import pytesseract
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Scan processing dependencies are missing. Install the backend requirements and Tesseract OCR.") from exc

    import os
    if os.getenv("TESSERACT_CMD"):
        pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]

    try:
        if extension == "pdf":
            try:
                document = fitz.open(stream=content, filetype="pdf")
            except Exception as exc:
                raise ValueError("Could not read this PDF. It may be damaged or password-protected.") from exc
            if document.page_count == 0 or document.page_count > 20:
                document.close()
                raise ValueError("A scanned PDF must contain between 1 and 20 pages.")
            try:
                page_texts = []
                for page in document:
                    scale = min(2, 2400 / max(page.rect.width, page.rect.height))
                    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
                    page_texts.append(pytesseract.image_to_string(image, lang="eng"))
                    image.close()
                return page_texts
            finally:
                document.close()
        try:
            image = Image.open(io.BytesIO(content))
            if image.width * image.height > 40_000_000:
                raise ValueError("Image dimensions are too large to process safely.")
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("Could not read this image file.") from exc
        with image.convert("RGB") as rgb_image:
            return [pytesseract.image_to_string(rgb_image, lang="eng")]
    except pytesseract.TesseractNotFoundError as exc:
        raise RuntimeError("Tesseract OCR is not installed or not on PATH. Install it or set TESSERACT_CMD.") from exc


def extract_ocr_fields(text):
    aliases = sorted(
        ((alias, field) for field, names in FIELD_ALIASES.items() for alias in names),
        key=lambda item: len(item[0]),
        reverse=True,
    )
    fields = {}
    for line in text.splitlines():
        candidate = line.strip()
        if not candidate:
            continue
        for alias, field in aliases:
            label_pattern = re.escape(alias).replace("_", r"[\s_-]+")
            match = re.match(rf"^{label_pattern}(?:\s*[:|]\s*|\s+)(.+?)\s*$", candidate, re.IGNORECASE)
            if match:
                fields[field] = match.group(1).strip()
                break
    return fields


def _clean(value):
    return str(value).strip() if value is not None else ""


def normalize_record(raw, db):
    source = {_header(key): value for key, value in raw.items() if key is not None}
    selected = {}
    known_headers = set()
    for field, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            if alias in source:
                selected[field] = source[alias]
                known_headers.add(alias)
                break

    existing_extra = source.get("extra")
    extra = dict(existing_extra) if isinstance(existing_extra, dict) else {}
    extra.update({
        str(key).strip(): value
        for key, value in raw.items()
        if key is not None and _header(key) not in known_headers and _header(key) != "extra"
    })
    data = {
        "reg_no": _clean(selected.get("reg_no")) or None,
        "candidate_id": _clean(selected.get("candidate_id")) or None,
        "full_name": _clean(selected.get("full_name")),
        "email": _clean(selected.get("email")).lower(),
        "phone": _clean(selected.get("phone")),
        "category": "",
        "department_slug": "",
        "amount": None,
        "paid": False,
        "paid_at": None,
        "extra": extra,
    }
    issues = []
    warnings = []

    if not data["full_name"]:
        issues.append("Full name is required.")
    email = data["email"]
    if not email or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        issues.append("A valid email address is required.")
    if len(re.sub(r"\D", "", data["phone"])) < 7:
        issues.append("A phone number with at least 7 digits is required.")

    category = _clean(selected.get("category")).upper()
    if category in {"IT", "IT STUDENT", "INFORMATION TECHNOLOGY"}:
        data["category"] = "IT"
    elif category in {"GENERAL", "GENERAL STUDENT"}:
        data["category"] = "GENERAL"
    else:
        issues.append("Category must be IT or GENERAL.")

    department_value = _clean(selected.get("department"))
    if department_value:
        department = db.query(Department).filter(
            (func.lower(Department.slug) == department_value.lower())
            | (func.lower(Department.name) == department_value.lower())
        ).first()
        if department:
            data["department_slug"] = department.slug
        else:
            issues.append(f"Unknown department: {department_value}.")
    else:
        issues.append("Department is required.")

    raw_amount = _clean(selected.get("amount"))
    if raw_amount:
        normalized_amount = re.sub(r"[^0-9.]", "", raw_amount)
        try:
            amount = Decimal(normalized_amount)
            if amount < 0 or amount != amount.to_integral_value():
                raise InvalidOperation
            data["amount"] = int(amount)
        except (InvalidOperation, ValueError):
            issues.append("Amount must be a non-negative whole number.")
    else:
        issues.append("Amount is required.")

    paid_value = _clean(selected.get("paid")).lower()
    if paid_value in {"paid", "yes", "true", "1", "complete", "completed"}:
        data["paid"] = True
    elif paid_value in {"", "unpaid", "pending", "no", "false", "0"}:
        data["paid"] = False
        if not paid_value:
            warnings.append("Payment status was not supplied; record will be marked unpaid.")
    else:
        issues.append("Payment status must be Paid or Unpaid/Pending.")

    paid_at = _clean(selected.get("paid_at"))
    if paid_at:
        try:
            data["paid_at"] = datetime.fromisoformat(paid_at.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            issues.append("Payment date must use YYYY-MM-DD or ISO date-time format.")
    return data, issues, warnings


def duplicate_issues(db, data, exclude_row_id=None):
    issues = []
    if data.get("reg_no"):
        student = db.query(Student).filter(func.lower(Student.reg_no) == data["reg_no"].lower()).first()
        if student:
            issues.append(f"Registration number {data['reg_no']} already exists.")
    if data.get("email") and data.get("department_slug"):
        student = db.query(Student).filter(
            func.lower(Student.email) == data["email"].lower(),
            Student.department_slug == data["department_slug"],
        ).first()
        if student:
            issues.append("A student with this email and department already exists.")

    staged_rows = db.query(ImportRow).filter(ImportRow.status.notin_(("imported", "skipped")))
    if exclude_row_id is not None:
        staged_rows = staged_rows.filter(ImportRow.id != exclude_row_id)
    for staged in staged_rows.all():
        try:
            other = json.loads(staged.data_json)
        except (TypeError, ValueError):
            continue
        other_reg_no = _clean(other.get("reg_no")).lower()
        if data.get("reg_no") and other_reg_no == data["reg_no"].lower():
            issues.append(f"Registration number {data['reg_no']} is repeated in another staged row.")
        other_email = _clean(other.get("email")).lower()
        if (data.get("email") and other_email == data["email"].lower()
                and data.get("department_slug") == other.get("department_slug")):
            issues.append("Email and department are repeated in another staged row.")
    return list(dict.fromkeys(issues))


def new_legacy_reg_no(db):
    year = datetime.utcnow().year
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(10):
        suffix = "".join(secrets.choice(alphabet) for _ in range(8))
        reg_no = f"LEG-{year}-{suffix}"
        if not db.query(Student).filter(Student.reg_no == reg_no).first():
            return reg_no
    raise RuntimeError("Could not generate a unique legacy registration number.")