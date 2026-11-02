from datetime import datetime
from uuid import uuid4
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from database import get_db
from models import Department, Student
from schemas import (
    AdminLoginIn,
    AdminLoginOut,
    AdminSessionOut,
    AdminSummaryOut,
    AdminTotals,
    AdminPerDepartment,
    AdminStudentRow,
    DepartmentCapacityUpdate,
    DepartmentCapacityOut,
)
from auth import (
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
    set_admin_cookie,
    clear_admin_cookie,
    admin_required,
)
from seed import MAX_ATTEMPTS, PASS_PERCENT, QUESTIONS_BY_DEPARTMENT, save_question_bank
from catalog import get_it_unified_price, load_catalog, set_it_unified_price, update_general_course_price

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/pricing", dependencies=[Depends(admin_required)])
def get_pricing():
    departments = []
    for department in load_catalog():
        raw_courses = department.get("subcourses", []) if department.get("has_subcourses") else [department]
        departments.append({
            "slug": department["slug"],
            "name": department["name"],
            "courses": [
                {
                    "slug": course.get("slug") if department.get("has_subcourses") else None,
                    "name": course["name"],
                    "durationWeeks": course.get("durationWeeks", department.get("durationWeeks")),
                    "price": course.get("price", department.get("generalPrice")),
                    "price_options": course.get("price_options"),
                }
                for course in raw_courses
            ],
        })
    return {"itUnifiedPrice": get_it_unified_price(), "departments": departments}


@router.put("/pricing/it", dependencies=[Depends(admin_required)])
def update_it_pricing(payload: dict):
    try:
        amount = set_it_unified_price(payload.get("amount"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"itUnifiedPrice": amount}


@router.put("/pricing/general", dependencies=[Depends(admin_required)])
def update_general_pricing(payload: dict):
    try:
        course = update_general_course_price(
            payload.get("departmentSlug"),
            payload.get("courseSlug"),
            payload.get("classType"),
            payload.get("amount"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True, "course": course}


def _validated_question(payload):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="A question object is required.")
    prompt = payload.get("q")
    options = payload.get("options")
    answer = payload.get("answer")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt.strip()) > 500:
        raise HTTPException(status_code=400, detail="Question text is required and must be 500 characters or fewer.")
    if not isinstance(options, list) or len(options) != 4:
        raise HTTPException(status_code=400, detail="Each question must have exactly four options.")
    options = [option.strip() if isinstance(option, str) else "" for option in options]
    if any(not option or len(option) > 240 for option in options):
        raise HTTPException(status_code=400, detail="Each option is required and must be 240 characters or fewer.")
    if isinstance(answer, bool) or not isinstance(answer, int) or answer not in range(4):
        raise HTTPException(status_code=400, detail="The correct answer must be an option from 0 to 3.")
    return {"q": prompt.strip(), "options": options, "answer": answer}


def _question_bank_output(department_slug):
    bank = QUESTIONS_BY_DEPARTMENT.get(department_slug)
    if bank is None:
        raise HTTPException(status_code=404, detail="Question bank not found for this department.")
    return {
        "department_slug": department_slug,
        "required_count": 20,
        "max_attempts": MAX_ATTEMPTS,
        "pass_percent": PASS_PERCENT,
        "questions": [
            {**question, "position": index + 1, "active": index < 20}
            for index, question in enumerate(bank)
        ],
    }


@router.get("/departments/{department_slug}/questions", dependencies=[Depends(admin_required)])
def get_department_questions(department_slug: str):
    return _question_bank_output(department_slug)


@router.post("/departments/{department_slug}/questions", dependencies=[Depends(admin_required)])
def add_department_question(department_slug: str, payload: dict):
    bank = QUESTIONS_BY_DEPARTMENT.get(department_slug)
    if bank is None:
        raise HTTPException(status_code=404, detail="Question bank not found for this department.")
    if len(bank) >= 100:
        raise HTTPException(status_code=409, detail="A question bank can contain at most 100 questions.")
    question = {"id": uuid4().hex, **_validated_question(payload), "active": True}
    save_question_bank(department_slug, [*bank, question])
    return _question_bank_output(department_slug)


@router.put("/departments/{department_slug}/questions/{question_id}", dependencies=[Depends(admin_required)])
def edit_department_question(department_slug: str, question_id: str, payload: dict):
    bank = QUESTIONS_BY_DEPARTMENT.get(department_slug)
    if bank is None:
        raise HTTPException(status_code=404, detail="Question bank not found for this department.")
    index = next((index for index, item in enumerate(bank) if item["id"] == question_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Question not found.")
    updated = list(bank)
    updated[index] = {"id": question_id, **_validated_question(payload), "active": bank[index].get("active", True)}
    save_question_bank(department_slug, updated)
    return _question_bank_output(department_slug)


@router.delete("/departments/{department_slug}/questions/{question_id}", dependencies=[Depends(admin_required)])
def delete_department_question(department_slug: str, question_id: str):
    bank = QUESTIONS_BY_DEPARTMENT.get(department_slug)
    if bank is None:
        raise HTTPException(status_code=404, detail="Question bank not found for this department.")
    if len(bank) <= 20:
        raise HTTPException(status_code=409, detail="Add a replacement question before deleting; every test must keep 20 questions.")
    updated = [question for question in bank if question["id"] != question_id]
    if len(updated) == len(bank):
        raise HTTPException(status_code=404, detail="Question not found.")
    save_question_bank(department_slug, updated)
    return _question_bank_output(department_slug)


@router.post("/login", response_model=AdminLoginOut)
def login(payload: AdminLoginIn, response: Response, db: Session = Depends(get_db)):
    if payload.username != ADMIN_USERNAME or payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    set_admin_cookie(response, payload.username)
    return {"success": True}


@router.post("/logout", response_model=AdminLoginOut)
def logout(response: Response):
    clear_admin_cookie(response)
    return {"success": True}


@router.get("/session", response_model=AdminSessionOut)
def session(admin_session: str | None = Cookie(default=None)):
    from auth import _read_token  # local import to avoid leaking at module top
    is_admin = False
    if admin_session:
        payload = _read_token(admin_session)
        is_admin = bool(payload and payload.get("u") == ADMIN_USERNAME)
    return {"isAdmin": is_admin}


@router.get("/summary", response_model=AdminSummaryOut, dependencies=[Depends(admin_required)])
def summary(db: Session = Depends(get_db)):
    students = db.query(Student).all()
    total_registered = len(students)
    total_it = sum(1 for s in students if s.category == "IT")
    total_general = sum(1 for s in students if s.category == "GENERAL")
    total_revenue = sum(s.amount for s in students if s.paid == 1)

    departments = db.query(Department).order_by(Department.name).all()
    per_dept = []
    for d in departments:
        d_students = [s for s in students if s.department_slug == d.slug]
        paid = sum(1 for s in d_students if s.paid == 1)
        revenue = sum(s.amount for s in d_students if s.paid == 1)
        per_dept.append(AdminPerDepartment(
            slug=d.slug,
            name=d.name,
            capacity=d.capacity,
            totalRegistered=len(d_students),
            paid=paid,
            revenue=revenue,
        ))

    return AdminSummaryOut(
        totals=AdminTotals(
            totalRegistered=total_registered,
            totalIt=total_it,
            totalGeneral=total_general,
            totalRevenue=total_revenue,
        ),
        perDepartment=per_dept,
    )


@router.put("/departments/{slug}", response_model=DepartmentCapacityOut, dependencies=[Depends(admin_required)])
def update_capacity(slug: str, payload: DepartmentCapacityUpdate, db: Session = Depends(get_db)):
    d = db.query(Department).filter(Department.slug == slug).first()
    if not d:
        raise HTTPException(status_code=404, detail="Department not found")
    if payload.capacity < 0:
        raise HTTPException(status_code=400, detail="Capacity must be non-negative")
    d.capacity = payload.capacity
    db.commit()
    return {"success": True, "slug": slug, "capacity": payload.capacity}


@router.get("/students", response_model=list[AdminStudentRow], dependencies=[Depends(admin_required)])
def all_students(db: Session = Depends(get_db)):
    rows = db.query(Student).order_by(Student.created_at.desc()).all()
    departments = {d.slug: d.name for d in db.query(Department).all()}

    def fmt(dt: datetime | None):
        if not dt:
            return None
        return dt.strftime("%Y-%m-%d %H:%M")

    out = []
    for s in rows:
        out.append({
            "reg_no": s.reg_no,
            "full_name": s.full_name,
            "email": s.email,
            "phone": s.phone,
            "category": s.category,
            "department_slug": s.department_slug,
            "department_name": departments.get(s.department_slug, s.department_slug),
            "amount": s.amount,
            "paid": bool(s.paid),
            "created_at": fmt(s.created_at),
            "paid_at": fmt(s.paid_at),
            "source_document_url": f"/api/admin/imports/students/{s.id}/document" if s.source_document_key else None,
        })
    return out
