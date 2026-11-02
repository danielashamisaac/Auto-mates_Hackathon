from fastapi import APIRouter, Depends, HTTPException
import json
from pathlib import Path
from sqlalchemy.orm import Session
from database import get_db
from models import Department, Student
from schemas import DepartmentOut
from catalog import get_it_unified_price

router = APIRouter(prefix="/api/departments", tags=["departments"])
CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "departments.json"


def _catalog():
    with CATALOG_PATH.open("r", encoding="utf-8") as source:
        return {row["slug"]: row for row in json.load(source)}


def _department_output(department, slots_remaining, catalog):
    course = catalog.get(department.slug, {})
    return {
        "slug": department.slug,
        "name": department.name,
        "capacity": department.capacity,
        "generalPrice": course.get("generalPrice", department.general_price),
        "slotsRemaining": slots_remaining,
        "isFull": slots_remaining == 0,
        "has_subcourses": course.get("has_subcourses", False),
        "subcourses": course.get("subcourses", []),
        "durationWeeks": course.get("durationWeeks"),
        "price": course.get("price"),
        "price_options": course.get("price_options"),
        "itUnifiedPrice": get_it_unified_price(),
    }


@router.get("", response_model=list[DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    departments = db.query(Department).order_by(Department.name).all()
    catalog = _catalog()
    result = []
    for d in departments:
        paid_count = db.query(Student).filter(
            Student.department_slug == d.slug, Student.paid == 1
        ).count()
        slots_remaining = max(0, d.capacity - paid_count)
        result.append(_department_output(d, slots_remaining, catalog))
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
    return _department_output(d, slots_remaining, _catalog())
