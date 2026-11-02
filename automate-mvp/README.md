# AUTOMATE Hub Solution

A hackathon MVP for unified student registration, eligibility assessment, and payment
management — built as a sci-fi dark-mode web portal.

```
automate-mvp/
  backend/   Python 3.10+ FastAPI + SQLAlchemy + SQLite (automate.db)
  frontend/  React + Vite + hand-written CSS + lucide-react + jspdf
```

---

## 1. Requirements

- Python 3.10 or newer (Windows users: install from python.org and tick "Add to PATH").
- Node.js 18+ (https://nodejs.org).
- Tesseract OCR installed on the backend host for scanned forms. Add `tesseract.exe` to
  `PATH`, or set `TESSERACT_CMD` to its full path.
- Nothing else — payment is a self-contained visual prototype, no Paystack account
  or API keys needed.

---

## 2. Setup (in VS Code)

### Terminal 1 — backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

If port 8000 is already in use, the app is configured to run on 8001. The frontend
proxy is already pointed to `http://localhost:8001`.

You should see `Uvicorn running on http://127.0.0.1:8001`. The SQLite database
(`backend/automate.db`) is created automatically on first boot, with the four
departments pre-seeded.

### Terminal 2 — frontend

```bash
cd frontend
npm install
npm run dev
```

Vite will print `Local: http://localhost:5173/` — open that URL in your browser.
All `/api/*` requests are proxied to the FastAPI server.

> Demo credentials for the Admin Portal: **admin / admin123** (hard-coded in
> `backend/auth.py`).

---

## 3. What's implemented

### Landing page
Three portal actions: **Student Capturing**, **Payment Portal**, **Admin Portal**.

### Student capturing flow
1. **Category** — IT Student (flat ₦22,000 across all departments) or General Student
   (department-based pricing: Data Science ₦150k, Cybersecurity ₦143k, Hardware ₦120k,
   Graphics ₦300k).
2. **Department** — Live capacity check; full departments are visibly blocked with a
   "Department Full — Please select another program" warning.
3. **Eligibility test** — 20 multiple-choice questions for the chosen department.
  Pass mark 60%, maximum 3 attempts. A **Reset Attempts** button on
   screen generates a fresh candidate ID for live demos.
4. **Bio-data form** — Category-specific fields. IT collects institution name, matric
   number, IT duration. General collects gender, DOB, address.
5. **Payment** — Simulated Paystack modal. **Simulate Successful Payment** records the
   payment in the database (no real card details collected).
6. **Success** — Two direct action buttons:
   - **Download Receipt (PDF)** — branded receipt generated via jspdf.
   - **Download Timetable (PDF)** — department-specific class timetable PDF.

Resume support: students can revisit **Payment Portal** and look themselves up by
reference (format `AUT-YYYY-XXXX`).

### Admin dashboard
Login-protected (`admin` / `admin123`). Live metrics:
- Total Registered, Total Revenue (₦), IT Students, General Students.
- Per-department breakdown with **editable capacity** (Save button per row).
- **Registration pricing** controls: one IT unified price across every course, plus
  per-course or per-mode General Student prices. Registration amounts are verified
  against the server-side catalog before a student record is created.
- Department-specific eligibility question banks with admin controls to view, add,
  edit, and delete questions while retaining 20 active questions per test.
- Registered candidates table with search and category filter.
- **Export Records as CSV** button at the bottom of the page — produces
  `automate-students-YYYY-MM-DD.csv` directly to the admin's device.

### Import existing registrations
Administrators can upload CSV, `.xlsx`, scanned PDF, and PNG/JPG/TIFF/WEBP image files.
Spreadsheets and each scanned PDF page are staged as records; scanned pages are OCR'd
with Tesseract and labeled fields are prefilled when recognized. Reviewers can compare
the original document with the extracted text, correct fields, and inspect validation
and duplicate errors before approval. Scanned records are approved individually, while
valid spreadsheet rows can be imported together. Approved scan records retain an
authenticated link to the archived original document on the student profile.

Scans are archived under `backend/import_archive` by default. Set `IMPORT_ARCHIVE_DIR`
to a durable, access-controlled volume in hosted deployments; the archive volume must
be backed up alongside the database. PDF uploads are limited to 20 pages and 20 MB;
spreadsheet uploads remain limited to 1,000 rows and 10 MB. OCR field prefill depends
on recognizable printed labels and should always be checked by a reviewer, especially
for handwriting.

---

## 4. API reference (high level)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/departments` | List departments with live slot counts |
| POST | `/api/eligibility/start` | Begin a test attempt |
| POST | `/api/eligibility/submit` | Score + persist an attempt |
| POST | `/api/students` | Create the pending-payment record |
| GET | `/api/students/{reg_no}` | Look up by registration reference |
| POST | `/api/payment/verify` | Mock — flips `paid=1` |
| POST | `/api/admin/login` | Hard-coded admin login (sets cookie) |
| GET | `/api/admin/session` | Returns `{ isAdmin }` |
| GET | `/api/admin/summary` | Totals + per-department breakdown |
| GET | `/api/admin/students` | Full registration list |
| PUT | `/api/admin/departments/{slug}` | Edit capacity |

Full schema is auto-published at `http://localhost:8000/docs` (Swagger UI).

---

## 5. Notes for the hackathon demo

- To reset everything between runs, stop the backend and delete `backend/automate.db`
  (and the `-wal` / `-shm` files next to it) — the database is recreated empty on the
  next `uvicorn` start, with departments re-seeded.
- Attempt limits are tracked by candidate ID stored in `sessionStorage`. The
  **Reset Attempts** button on the eligibility screen generates a fresh candidate ID
  so judges can re-test during the live demo without clearing their browser.
- The PDF receipt and timetable are generated entirely in the browser with jspdf —
  no server-side PDF tooling required.
- The CSV export uses a Blob download in the browser; no Python `csv` library endpoint.
