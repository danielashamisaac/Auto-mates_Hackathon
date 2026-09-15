from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Student
from schemas import PaymentVerifyIn, PaymentVerifyOut

router = APIRouter(prefix="/api/payment", tags=["payment"])


@router.post("/verify", response_model=PaymentVerifyOut)
def verify(payload: PaymentVerifyIn, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.reg_no == payload.regNo).first()
    if not student:
        raise HTTPException(status_code=404, detail="Registration not found")

    if student.paid == 1:
        return {"verified": True, "alreadyPaid": True}

    student.paid = 1
    student.paystack_ref = f"MOCK_{student.reg_no}_{int(datetime.utcnow().timestamp())}"
    student.paid_at = datetime.utcnow()
    db.commit()

    return {"verified": True, "alreadyPaid": False}
