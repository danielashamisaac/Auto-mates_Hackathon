import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Department, Attempt, Student
from schemas import StudentCreateIn, StudentCreateOut, StudentOut
from utils import generate_reg_no

router = APIRouter(prefix="/api/students", tags=["students"])

IT_FLAT_PRICE = 22000


def _resolve_amount(db: Session, department_slug: str, category: str) -> tuple[Department, int]:
    d = db.query(Department).filter(Department.slug == department_slug).first()
    if not d:
        raise HTTPException(status_code=404, detail="Department not found")
    if category == "IT":
        return d, IT_FLAT_PRICE
    if category == "GENERAL":
        return d, d.general_price
    raise HTTPException(status_code=400, detail="category must be IT or GENERAL")


@router.post("", response_model=StudentCreateOut)
def create_student(payload: StudentCreateIn, db: Session = Depends(get_db)):
    dept, amount = _resolve_amount(db, payload.departmentSlug, payload.category)

    passed = db.query(Attempt).filter(
        Attempt.candidate_id == payload.candidateId,
        Attempt.department_slug == dept.slug,
        Attempt.passed == 1,
    ).first()
    if not passed:
        raise HTTPException(status_code=403, detail="Eligibility must be passed first")

    existing = db.query(Student).filter(
        Student.candidate_id == payload.candidateId,
        Student.department_slug == dept.slug,
    ).first()
    if existing:
        return {
            "studentId": existing.id,
            "regNo": existing.reg_no,
            "amount": existing.amount,
            "departmentName": dept.name,
            "category": existing.category,
        }

    for _ in range(5):
        reg_no = generate_reg_no()
        collision = db.query(Student).filter(Student.reg_no == reg_no).first()
        if not collision:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate a unique reference")

    student = Student(
        reg_no=reg_no,
        candidate_id=payload.candidateId,
        department_slug=dept.slug,
        category=payload.category,
        full_name=payload.fullName,
        email=payload.email,
        phone=payload.phone,
        extra_json=json.dumps(payload.extra or {}),
        amount=amount,
        paid=0,
    )
    db.add(student)
    db.commit()
    db.refresh(student)

    return {
        "studentId": student.id,
        "regNo": student.reg_no,
        "amount": student.amount,
        "departmentName": dept.name,
        "category": student.category,
    }


def _to_out(db: Session, s: Student) -> StudentOut:
    dept = db.query(Department).filter(Department.slug == s.department_slug).first()
    return {
        "regNo": s.reg_no,
        "departmentSlug": s.department_slug,
        "departmentName": dept.name if dept else s.department_slug,
        "category": s.category,
        "fullName": s.full_name,
        "email": s.email,
        "phone": s.phone,
        "amount": s.amount,
        "paid": bool(s.paid),
    }


@router.get("/{reg_no}", response_model=StudentOut)
def get_student(reg_no: str, db: Session = Depends(get_db)):
    s = db.query(Student).filter(Student.reg_no == reg_no).first()
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")
    return _to_out(db, s)
