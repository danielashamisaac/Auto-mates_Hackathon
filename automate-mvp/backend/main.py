from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import seed

seed.run()

from routers import departments, eligibility, students, payment, admin

app = FastAPI(
    title="AUTOMATE Hub Solution API",
    version="1.0.0",
    description="Hackathon MVP — student registration, eligibility, payment, and admin dashboard.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    seed.run()


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(departments.router)
app.include_router(eligibility.router)
app.include_router(students.router)
app.include_router(payment.router)
app.include_router(admin.router)
