from sqlalchemy import Column, ForeignKey, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from database import Base


class Department(Base):
    __tablename__ = "departments"

    slug = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    capacity = Column(Integer, nullable=False)
    general_price = Column(Integer, nullable=False)


class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(String, nullable=False, index=True)
    department_slug = Column(String, nullable=False, index=True)
    score = Column(Integer, nullable=False)
    passed = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    reg_no = Column(String, unique=True, nullable=False, index=True)
    candidate_id = Column(String, nullable=False, index=True)
    department_slug = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    extra_json = Column(Text, nullable=True)
    amount = Column(Integer, nullable=False)
    paid = Column(Integer, nullable=False, default=0)
    paystack_ref = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    paid_at = Column(DateTime, nullable=True)
    source_document_key = Column(String, nullable=True)


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True, index=True)
    source_type = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    created_by = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending_review")
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    document_key = Column(String, nullable=True)


class ImportRow(Base):
    __tablename__ = "import_rows"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("import_batches.id"), nullable=False, index=True)
    row_number = Column(Integer, nullable=False)
    raw_json = Column(Text, nullable=False)
    data_json = Column(Text, nullable=False)
    issues_json = Column(Text, nullable=False, default="[]")
    warnings_json = Column(Text, nullable=False, default="[]")
    status = Column(String, nullable=False, default="pending_review")
    created_student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    source_text = Column(Text, nullable=True)
