import json
import os
from sqlalchemy.orm import Session
from database import engine, SessionLocal
from models import Base, Department, Attempt, Student


DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DEPARTMENTS_FILE = os.path.join(DATA_DIR, "departments.json")
QUESTIONS_FILE = os.path.join(DATA_DIR, "questions.json")
TIMETABLE_FILE = os.path.join(DATA_DIR, "timetable.json")

MAX_ATTEMPTS = 3
PASS_PERCENT = 60

QUESTIONS_BY_DEPARTMENT: dict[str, list[dict]] = {}
TIMETABLE_BY_DEPARTMENT: dict[str, dict] = {}


def _load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def ensure_tables():
    Base.metadata.create_all(bind=engine)


def seed_departments(db: Session):
    if db.query(Department).count() > 0:
        return
    rows = _load_json(DEPARTMENTS_FILE)
    for row in rows:
        db.add(Department(
            slug=row["slug"],
            name=row["name"],
            capacity=row["capacity"],
            general_price=row["generalPrice"],
        ))
    db.commit()


def load_static_data():
    global QUESTIONS_BY_DEPARTMENT, TIMETABLE_BY_DEPARTMENT
    QUESTIONS_BY_DEPARTMENT = _load_json(QUESTIONS_FILE)
    TIMETABLE_BY_DEPARTMENT = _load_json(TIMETABLE_FILE)


def run():
    ensure_tables()
    db = SessionLocal()
    try:
        seed_departments(db)
    finally:
        db.close()
    load_static_data()
