from sqlalchemy import Column, Integer, String, DateTime, Text
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
