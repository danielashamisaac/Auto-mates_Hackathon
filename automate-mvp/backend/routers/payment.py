import json
import os
from datetime import datetime
from urllib import error, request

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Student
from schemas import PaymentInitIn, PaymentInitOut, PaymentVerifyIn, PaymentVerifyOut

router = APIRouter(prefix="/api/payment", tags=["payment"])

PAYSTACK_BASE_URL = os.getenv("PAYSTACK_BASE_URL", "https://api.paystack.co")


def _service_fee(amount: int) -> int:
    return int(round(amount * 0.1))


def _registration_fee(amount: int) -> int:
    return int(round(amount / 1.1))


def _paystack_secret() -> str:
    secret = (os.getenv("PAYSTACK_SECRET_KEY") or "").strip()
    if not secret or secret.startswith("sk_test_your") or secret.startswith("your_"):
        raise HTTPException(status_code=500, detail="Paystack secret key is not configured. Add PAYSTACK_SECRET_KEY to backend/.env.")
    return secret


def _paystack_request(method: str, path: str, payload: dict | None = None):
    secret = _paystack_secret()
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"{PAYSTACK_BASE_URL}{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
            "User-Agent": "AUTOMATE-Hub-Solution/1.0",
        },
        method=method,
    )
    try:
        with request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(body)
            message = payload.get("message") or payload.get("error") or "Paystack request failed"
        except Exception:
            message = body or "Paystack request failed"
        raise HTTPException(status_code=400, detail=message)


@router.post("/initialize", response_model=PaymentInitOut)
def initialize(payload: PaymentInitIn, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.reg_no == payload.regNo).first()
    if not student:
        raise HTTPException(status_code=404, detail="Registration not found")

    if student.paid == 1:
        amount = int(student.amount or 0)
        service_fee = _service_fee(amount)
        registration_fee = amount - service_fee
        return {
            "alreadyPaid": True,
            "amount": amount,
            "registrationFee": registration_fee,
            "serviceFee": service_fee,
            "reference": student.paystack_ref or student.reg_no,
            "authorizationUrl": None,
            "status": "paid",
        }

    total_amount = int(student.amount or 0)
    registration_fee = _registration_fee(total_amount)
    service_fee = total_amount - registration_fee
    reference = payload.reference if hasattr(payload, "reference") else None
    if not reference:
        reference = f"AUT-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{student.id}"

    callback_url = os.getenv("PAYSTACK_CALLBACK_URL", "http://localhost:5173/capture/payment")
    paystack_payload = {
        "email": payload.email or student.email,
        "amount": total_amount * 100,
        "currency": "NGN",
        "reference": reference,
        "callback_url": callback_url,
        "metadata": {
            "student_reg_no": student.reg_no,
            "full_name": student.full_name,
            "department_slug": student.department_slug,
            "category": student.category,
        },
    }

    response = _paystack_request("POST", "/transaction/initialize", paystack_payload)
    authorization_url = response.get("data", {}).get("authorization_url")
    if not authorization_url:
        raise HTTPException(status_code=500, detail="Unable to create Paystack checkout")

    student.paystack_ref = reference
    db.commit()

    return {
        "alreadyPaid": False,
        "amount": total_amount,
        "registrationFee": registration_fee,
        "serviceFee": service_fee,
        "reference": reference,
        "authorizationUrl": authorization_url,
        "status": "pending",
    }


@router.post("/verify", response_model=PaymentVerifyOut)
def verify(payload: PaymentVerifyIn, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.reg_no == payload.regNo).first()
    if not student:
        raise HTTPException(status_code=404, detail="Registration not found")

    if student.paid == 1:
        return {"verified": True, "alreadyPaid": True, "reference": student.paystack_ref, "amount": student.amount}

    reference = payload.reference or student.paystack_ref
    if not reference:
        raise HTTPException(status_code=400, detail="No payment reference provided")

    response = _paystack_request("GET", f"/transaction/verify/{reference}")
    data = response.get("data") or {}
    status = (data.get("status") or "").lower()
    amount_paid = int((data.get("amount") or 0) / 100)

    if status != "success":
        return {"verified": False, "alreadyPaid": False, "reference": reference, "amount": amount_paid}

    expected_amount = int(student.amount or 0)
    if amount_paid != expected_amount:
        return {"verified": False, "alreadyPaid": False, "reference": reference, "amount": amount_paid}

    student.paid = 1
    student.paystack_ref = reference
    student.paid_at = datetime.utcnow()
    db.commit()

    return {"verified": True, "alreadyPaid": False, "reference": reference, "amount": expected_amount}
