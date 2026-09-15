from datetime import datetime
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

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
        })
    return out
