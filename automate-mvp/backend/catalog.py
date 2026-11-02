import json
import os
from pathlib import Path


CATALOG_PATH = Path(__file__).resolve().parent / "data" / "departments.json"
PRICING_PATH = Path(__file__).resolve().parent / "data" / "pricing.json"


def load_catalog():
    with CATALOG_PATH.open("r", encoding="utf-8") as source:
        return json.load(source)


def catalog_by_slug():
    return {department["slug"]: department for department in load_catalog()}


def get_it_unified_price():
    with PRICING_PATH.open("r", encoding="utf-8") as source:
        return int(json.load(source)["itUnifiedPrice"])


def _write_json(path, value):
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    try:
        with temporary_path.open("w", encoding="utf-8") as destination:
            json.dump(value, destination, indent=2, ensure_ascii=False)
        os.replace(temporary_path, path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


def set_it_unified_price(amount):
    if isinstance(amount, bool) or not isinstance(amount, int) or amount < 0:
        raise ValueError("The IT unified price must be a non-negative whole number.")
    _write_json(PRICING_PATH, {"itUnifiedPrice": amount})
    return amount


def update_general_course_price(department_slug, course_slug, class_type, amount):
    if isinstance(amount, bool) or not isinstance(amount, int) or amount < 0:
        raise ValueError("Course prices must be non-negative whole numbers.")
    catalog = load_catalog()
    department = next((item for item in catalog if item["slug"] == department_slug), None)
    if department is None:
        raise ValueError("Department not found.")

    if department.get("has_subcourses"):
        course = next(
            (item for item in department.get("subcourses", []) if item["slug"] == course_slug),
            None,
        )
        if course is None:
            raise ValueError("Select a valid sub-course for this department.")
    else:
        if course_slug not in (None, "", department_slug):
            raise ValueError("This department does not have sub-courses.")
        course = department

    options = course.get("price_options") or {}
    if options:
        if class_type not in {"physical", "virtual"} or class_type not in options:
            raise ValueError("Select a class mode that exists for this course.")
        options[class_type] = amount
        course["price_options"] = options
        if course is department:
            department["generalPrice"] = options.get("physical", options.get("virtual", amount))
    else:
        if class_type not in (None, ""):
            raise ValueError("This course has a single price and no class-mode pricing.")
        course["price"] = amount
        if course is department:
            department["generalPrice"] = amount

    _write_json(CATALOG_PATH, catalog)
    return course


def resolve_course_price(department_slug, selection):
    department = catalog_by_slug().get(department_slug)
    if not department:
        return None

    subcourse_slug = selection.get("selected_subcourse")
    if department.get("has_subcourses"):
        course = next(
            (item for item in department.get("subcourses", []) if item["slug"] == subcourse_slug),
            None,
        )
        if course is None:
            return None
    elif subcourse_slug:
        return None
    else:
        course = department

    class_type = selection.get("class_type")
    price_options = course.get("price_options") or {}
    if price_options:
        if class_type not in price_options:
            return None
        amount = price_options[class_type]
    else:
        if class_type:
            return None
        amount = course.get("price", department.get("generalPrice"))

    return course, int(amount)
