from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, EmailStr


class DepartmentOut(BaseModel):
    slug: str
    name: str
    capacity: int
    generalPrice: int
    slotsRemaining: int
    isFull: bool


class StartEligibilityIn(BaseModel):
    candidateId: str
    departmentSlug: str


class SubmitEligibilityIn(BaseModel):
    candidateId: str
    departmentSlug: str
    answers: List[int]


class QuestionOut(BaseModel):
    index: int
    q: str
    options: List[str]


class StartEligibilityOut(BaseModel):
    departmentSlug: str
    departmentName: str
    attemptsUsed: int
    attemptsRemaining: int
    passPercent: int
    questions: List[QuestionOut]


class SubmitEligibilityOut(BaseModel):
    score: int
    passed: bool
    attemptsUsed: int
    attemptsRemaining: int
    locked: bool


class EligibilityStatusOut(BaseModel):
    eligible: bool


class StudentCreateIn(BaseModel):
    candidateId: str
    departmentSlug: str
    category: str
    fullName: str
    email: EmailStr
    phone: str
    extra: Dict[str, Any]


class StudentOut(BaseModel):
    regNo: str
    departmentSlug: str
    departmentName: str
    category: str
    fullName: str
    email: str
    phone: str
    amount: int
    paid: bool


class StudentCreateOut(BaseModel):
    studentId: int
    regNo: str
    amount: int
    departmentName: str
    category: str


class PaymentVerifyIn(BaseModel):
    regNo: str


class PaymentVerifyOut(BaseModel):
    verified: bool
    alreadyPaid: bool


class AdminLoginIn(BaseModel):
    username: str
    password: str


class AdminLoginOut(BaseModel):
    success: bool


class AdminSessionOut(BaseModel):
    isAdmin: bool


class AdminStudentRow(BaseModel):
    reg_no: str
    full_name: str
    email: str
    phone: str
    category: str
    department_slug: str
    department_name: str
    amount: int
    paid: bool
    created_at: str
    paid_at: Optional[str] = None


class AdminPerDepartment(BaseModel):
    slug: str
    name: str
    capacity: int
    totalRegistered: int
    paid: int
    revenue: int


class AdminTotals(BaseModel):
    totalRegistered: int
    totalIt: int
    totalGeneral: int
    totalRevenue: int


class AdminSummaryOut(BaseModel):
    totals: AdminTotals
    perDepartment: List[AdminPerDepartment]


class DepartmentCapacityUpdate(BaseModel):
    capacity: int


class DepartmentCapacityOut(BaseModel):
    success: bool
    slug: str
    capacity: int
