import json
import os
from sqlalchemy import inspect, text
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

STARTER_QUESTION_TEMPLATES = [
    ("Before starting a {course} task, what should be clarified first?", ["The required outcome and constraints", "The final file name only", "How to skip testing", "How to avoid documenting work"], 0),
    ("Which is the best way to learn an unfamiliar tool used in {course}?", ["Guess at every control", "Consult reliable documentation and test safely", "Copy unverified settings", "Ignore warnings"], 1),
    ("Why should working files for {course} be organized clearly?", ["So work can be found, reviewed, and continued", "To make files impossible to share", "To remove the need for backups", "To hide errors"], 0),
    ("What is a good way to check a {course} result?", ["Assume it is correct", "Compare it with the requirements and test it", "Only check its file name", "Delete the source files"], 1),
    ("When a {course} result is unexpected, what should you do first?", ["Change many settings at once", "Review inputs and repeat the steps systematically", "Hide the result", "Skip all checks"], 1),
    ("How should personal information encountered during {course} work be handled?", ["Share it publicly", "Use only what is needed and restrict access", "Copy it to personal accounts", "Keep it forever without a reason"], 1),
    ("What makes feedback useful on a {course} project?", ["It identifies a specific issue and a possible improvement", "It changes the goal without explanation", "It avoids examples", "It is given only after files are deleted"], 0),
    ("Why keep a backup before making major changes to {course} work?", ["To recover the original if a change causes a problem", "To increase the number of errors", "To replace verification", "To remove version history"], 0),
    ("Which source is most dependable when checking a technical fact about {course}?", ["An unverified post", "Official documentation or a trusted reference", "A guess from memory", "An unrelated advertisement"], 1),
    ("What should be included when handing off {course} work?", ["The deliverable and clear notes about its status", "Only an unexplained screenshot", "A broken source file", "No information about limitations"], 0),
    ("How can errors in a {course} project be reduced?", ["Work in small steps and check results regularly", "Make all changes at the end", "Ignore test results", "Avoid saving versions"], 0),
    ("When should safety guidance be followed during practical {course} work?", ["Only after an incident", "Before and throughout the task", "Only when someone is watching", "Never, if the task seems familiar"], 1),
    ("What is the best response when a requirement for {course} work is unclear?", ["Ask for clarification before making assumptions", "Choose a random interpretation", "Skip the requirement", "Submit unrelated work"], 0),
    ("Why is it useful to record important steps in a {course} task?", ["It helps another person review or reproduce the work", "It prevents anyone from checking the result", "It replaces the final deliverable", "It makes the process less clear"], 0),
    ("Which approach is best when selecting an export format for {course} work?", ["Choose a format that meets the recipient's needs", "Always choose the largest file", "Rename the extension without converting", "Use a format the recipient cannot open"], 0),
    ("How should a deadline be managed on a {course} project?", ["Break the work into steps and check progress", "Wait until the final hour to begin", "Skip review", "Avoid estimating task time"], 0),
    ("What is a sensible way to respond to a reviewer's correction on {course} work?", ["Check the feedback, make the needed change, and verify it", "Delete the entire project", "Ignore all comments", "Change unrelated sections"], 0),
    ("What should be done before sharing a {course} deliverable?", ["Check that it opens and contains the intended result", "Remove all useful context", "Share private source data unnecessarily", "Assume the recipient has every required file"], 0),
    ("Why is accessibility worth considering in {course} work?", ["It helps more people use and understand the result", "It only changes the file size", "It makes quality checks unnecessary", "It prevents feedback"], 0),
    ("What is a good final check for a completed {course} task?", ["Verify the deliverable, requirements, and supporting files", "Delete drafts before checking the final", "Rely only on memory", "Skip the handoff"], 0),
]


def _load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def ensure_tables():
    Base.metadata.create_all(bind=engine)
    migrations = {
        "students": {"source_document_key": "VARCHAR"},
        "import_batches": {"document_key": "VARCHAR"},
        "import_rows": {"source_text": "TEXT"},
    }
    with engine.begin() as connection:
        inspector = inspect(connection)
        for table, columns in migrations.items():
            existing = {column["name"] for column in inspector.get_columns(table)}
            for name, column_type in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {column_type}"))


def seed_departments(db: Session):
    rows = _load_json(DEPARTMENTS_FILE)
    for row in rows:
        department = db.query(Department).filter(Department.slug == row["slug"]).first()
        if department is None:
            db.add(Department(
                slug=row["slug"],
                name=row["name"],
                capacity=row["capacity"],
                general_price=row["generalPrice"],
            ))
        else:
            department.name = row["name"]
            department.general_price = row["generalPrice"]
    db.commit()


def load_static_data():
    raw_questions = _load_json(QUESTIONS_FILE)
    catalog = _load_json(DEPARTMENTS_FILE)
    question_banks = {}
    for department in catalog:
        department_slug = department["slug"]
        questions = list(raw_questions.get(department_slug, []))[:100]
        active_count = sum(1 for question in questions if question.get("active", True))
        for index in range(active_count, 20):
            prompt, options, answer = STARTER_QUESTION_TEMPLATES[index % len(STARTER_QUESTION_TEMPLATES)]
            questions.append({
                "q": prompt.format(course=department["name"]),
                "options": options,
                "answer": answer,
                "active": True,
            })
        question_banks[department_slug] = [
            {
                **question,
                "id": question.get("id", f"{department_slug}-q-{index + 1:02d}"),
                "active": question.get("active", True),
            }
            for index, question in enumerate(questions)
        ]
    QUESTIONS_BY_DEPARTMENT.clear()
    QUESTIONS_BY_DEPARTMENT.update(question_banks)
    TIMETABLE_BY_DEPARTMENT.clear()
    TIMETABLE_BY_DEPARTMENT.update(_load_json(TIMETABLE_FILE))


def save_question_bank(department_slug: str, questions: list[dict]):
    if department_slug not in QUESTIONS_BY_DEPARTMENT:
        raise KeyError(department_slug)
    questions = [
        {**question, "active": index < 20}
        for index, question in enumerate(questions)
    ]
    if len(questions) < 20:
        raise ValueError("Every eligibility question bank must retain at least 20 questions.")
    updated_banks = {**QUESTIONS_BY_DEPARTMENT, department_slug: questions}
    serialized = {
        slug: [
            {key: value for key, value in question.items() if key != "position"}
            for question in bank
        ]
        for slug, bank in updated_banks.items()
    }
    temporary_path = QUESTIONS_FILE + ".tmp"
    try:
        with open(temporary_path, "w", encoding="utf-8") as destination:
            json.dump(serialized, destination, indent=2, ensure_ascii=False)
        os.replace(temporary_path, QUESTIONS_FILE)
    finally:
        if os.path.exists(temporary_path):
            os.remove(temporary_path)
    QUESTIONS_BY_DEPARTMENT[department_slug] = questions


def run():
    ensure_tables()
    db = SessionLocal()
    try:
        seed_departments(db)
    finally:
        db.close()
    load_static_data()
