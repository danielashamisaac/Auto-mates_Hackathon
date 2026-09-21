from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Department, Attempt, Student
from schemas import (
    StartEligibilityIn,
    SubmitEligibilityIn,
    StartEligibilityOut,
    SubmitEligibilityOut,
    EligibilityStatusOut,
    QuestionOut,
)
from seed import QUESTIONS_BY_DEPARTMENT, MAX_ATTEMPTS, PASS_PERCENT

router = APIRouter(prefix="/api/eligibility", tags=["eligibility"])


def _attempts_used(db: Session, candidate_id: str, slug: str) -> int:
    return db.query(Attempt).filter(
        Attempt.candidate_id == candidate_id,
        Attempt.department_slug == slug,
    ).count()


def _department_or_404(db: Session, slug: str) -> Department:
    d = db.query(Department).filter(Department.slug == slug).first()
    if not d:
        raise HTTPException(status_code=404, detail="Department not found")
    return d


def _slots_remaining(db: Session, slug: str) -> int:
    d = _department_or_404(db, slug)
    paid = db.query(Student).filter(
        Student.department_slug == slug, Student.paid == 1
    ).count()
    return max(0, d.capacity - paid)


@router.post("/start", response_model=StartEligibilityOut)
def start(payload: StartEligibilityIn, db: Session = Depends(get_db)):
    dept = _department_or_404(db, payload.departmentSlug)
    questions = QUESTIONS_BY_DEPARTMENT.get(dept.slug)
    if not questions:
        raise HTTPException(status_code=500, detail="No questions configured for department")

    if _slots_remaining(db, dept.slug) == 0:
        raise HTTPException(status_code=409, detail="Department is full")

    used = _attempts_used(db, payload.candidateId, dept.slug)
    remaining = max(0, MAX_ATTEMPTS - used)
    if remaining == 0:
        raise HTTPException(status_code=403, detail="No attempts remaining for this department")

    sampled = [
        QuestionOut(
            id=question["id"],
            position=index,
            q=question["q"],
            options=question["options"],
        )
        for index, question in enumerate(questions)
    ]

    return {
        "departmentSlug": dept.slug,
        "departmentName": dept.name,
        "attemptsUsed": used,
        "attemptsRemaining": remaining,
        "passPercent": PASS_PERCENT,
        "questions": sampled,
    }


@router.post("/submit", response_model=SubmitEligibilityOut)
def submit(payload: SubmitEligibilityIn, db: Session = Depends(get_db)):
    dept = _department_or_404(db, payload.departmentSlug)
    questions = QUESTIONS_BY_DEPARTMENT.get(dept.slug)
    if not questions:
        raise HTTPException(status_code=500, detail="No questions configured for department")

    used = _attempts_used(db, payload.candidateId, dept.slug)
    if used >= MAX_ATTEMPTS:
        raise HTTPException(status_code=403, detail="No attempts remaining for this department")

    if db.query(Attempt).filter(
        Attempt.candidate_id == payload.candidateId,
        Attempt.department_slug == dept.slug,
        Attempt.passed == 1,
    ).first():
        raise HTTPException(status_code=409, detail="Eligibility has already been passed")

    expected_ids = {question["id"] for question in questions}
    submitted_ids = [answer.questionId for answer in payload.answers]
    if len(submitted_ids) != len(expected_ids) or set(submitted_ids) != expected_ids:
        raise HTTPException(status_code=400, detail="Answers must include each eligibility question exactly once")

    answers_by_id = {answer.questionId: answer.answer for answer in payload.answers}
    correct = 0
    for question in questions:
        answer = answers_by_id[question["id"]]
        if answer < 0 or answer >= len(question["options"]):
            raise HTTPException(status_code=400, detail="Answer option is out of range")
        if answer == question["answer"]:
            correct += 1

    percent = round((correct / len(questions)) * 100)
    passed = percent >= PASS_PERCENT

    attempt = Attempt(
        candidate_id=payload.candidateId,
        department_slug=dept.slug,
        score=percent,
        passed=1 if passed else 0,
    )
    db.add(attempt)
    db.commit()

    used = _attempts_used(db, payload.candidateId, dept.slug)
    remaining = max(0, MAX_ATTEMPTS - used)
    locked = (not passed) and remaining == 0

    return {
        "score": percent,
        "passed": passed,
        "attemptsUsed": used,
        "attemptsRemaining": remaining,
        "locked": locked,
    }


@router.get("/status", response_model=EligibilityStatusOut)
def status(candidateId: str, departmentSlug: str, db: Session = Depends(get_db)):
    _department_or_404(db, departmentSlug)
    passed = db.query(Attempt).filter(
        Attempt.candidate_id == candidateId,
        Attempt.department_slug == departmentSlug,
        Attempt.passed == 1,
    ).first()
    return {"eligible": passed is not None}
