from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Department, Student
from schemas import DepartmentOut

router = APIRouter(prefix="/api/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    departments = db.query(Department).order_by(Department.name).all()
    result = []
    for d in departments:
        paid_count = db.query(Student).filter(
            Student.department_slug == d.slug, Student.paid == 1
        ).count()
        slots_remaining = max(0, d.capacity - paid_count)
        result.append({
            "slug": d.slug,
            "name": d.name,
            "capacity": d.capacity,
            "generalPrice": d.general_price,
            "slotsRemaining": slots_remaining,
            "isFull": slots_remaining == 0,
        })
    return result


@router.get("/{slug}", response_model=DepartmentOut)
def get_department(slug: str, db: Session = Depends(get_db)):
    d = db.query(Department).filter(Department.slug == slug).first()
    if not d:
        raise HTTPException(status_code=404, detail="Department not found")
    paid_count = db.query(Student).filter(
        Student.department_slug == d.slug, Student.paid == 1
    ).count()
    slots_remaining = max(0, d.capacity - paid_count)
    return {
        "slug": d.slug,
        "name": d.name,
        "capacity": d.capacity,
        "generalPrice": d.general_price,
        "slotsRemaining": slots_remaining,
        "isFull": slots_remaining == 0,
    }
