import secrets
import string
from datetime import datetime


def generate_reg_no() -> str:
    alphabet = string.ascii_uppercase + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(4))
    return f"AUT-{datetime.utcnow().year}-{suffix}"
