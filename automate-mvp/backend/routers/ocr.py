import base64
import logging
import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from google import genai
from google.genai import interactions, types
from pydantic import BaseModel, Field, ValidationError
from starlette.concurrency import run_in_threadpool

from auth import admin_required
from ocr_providers import GEMINI_MODEL, GEMINI_TIMEOUT_MS, _with_gemini_retries

router = APIRouter(
    prefix="/api/ocr",
    tags=["OCR"],
    dependencies=[Depends(admin_required)],
)
logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
SUPPORTED_CONTENT_TYPES = {
    "application/pdf",
    "image/heic",
    "image/heif",
    "image/jpeg",
    "image/png",
    "image/webp",
}


class GeminiOCRResult(BaseModel):
    source_text: str = Field(min_length=1)
    reg_no: str | None = Field(default=None, min_length=1)
    candidate_id: str | None = Field(default=None, min_length=1)
    full_name: str | None = Field(default=None, min_length=1)
    email: str | None = Field(default=None, min_length=1)
    phone: str | None = Field(default=None, min_length=1)
    category: str | None = Field(default=None, min_length=1)
    department_slug: str | None = Field(default=None, min_length=1)
    amount: float | None = None
    paid: bool | None = None
    paid_at: str | None = Field(default=None, min_length=1)


def _extract_with_gemini(api_key: str, content_type: str, file_bytes: bytes, prompt: str) -> str:
    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS),
    )
    if content_type == "application/pdf":
        document_content = interactions.DocumentContent(
            data=base64.b64encode(file_bytes).decode("ascii"),
            mime_type="application/pdf",
        )
    else:
        document_content = interactions.ImageContent(
            data=base64.b64encode(file_bytes).decode("ascii"),
            mime_type=content_type,
        )
    response = client.interactions.create(
        model=GEMINI_MODEL,
        input=[
            interactions.TextContent(text=prompt),
            document_content,
        ],
        response_format=interactions.TextResponseFormat(
            mime_type="application/json",
            schema=GeminiOCRResult.model_json_schema(),
        ),
        generation_config=interactions.GenerationConfig(temperature=0.1),
    )
    return response.output_text or ""


@router.post("/gemini-extract", response_model=GeminiOCRResult)
async def gemini_extract(file: UploadFile = File(...)):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Gemini OCR is not configured on the server.")

    content_type = file.content_type or "image/jpeg"
    if content_type not in SUPPORTED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Upload a PDF or supported image file.")

    image_bytes = await file.read(MAX_UPLOAD_BYTES + 1)
    if not image_bytes:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The uploaded file must be 20 MB or less.")

    prompt = (
        "Extract the registration form into one JSON object with exactly these keys: "
        "source_text, reg_no, candidate_id, full_name, email, phone, category, "
        "department_slug, amount, paid, and paid_at. source_text must contain the "
        "visible text transcribed from the form. Use null for values that are missing "
        "or unreadable. Do not infer values or include markdown."
    )
    try:
        response_text = await run_in_threadpool(
            _with_gemini_retries,
            _extract_with_gemini,
            api_key,
            content_type,
            image_bytes,
            prompt,
        )
    except Exception as exc:
        logger.exception("Gemini OCR request failed")
        status_code = getattr(exc, "status_code", None)
        if type(exc).__name__ == "APITimeoutError":
            detail = "Gemini did not respond before the timeout. Try a smaller file or check the backend internet connection."
        elif status_code == 503:
            detail = "Gemini is temporarily unavailable; try again shortly."
        elif status_code in {401, 403}:
            detail = "Gemini rejected the API credentials or access configuration."
        else:
            detail = "Gemini extraction failed; check the backend logs for details."
        raise HTTPException(
            status_code=502,
            detail=detail,
        ) from exc

    if not response_text or not response_text.strip():
        raise HTTPException(
            status_code=500,
            detail="Gemini returned an empty response for the uploaded file.",
        )

    try:
        result = GeminiOCRResult.model_validate_json(response_text)
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Gemini returned invalid structured OCR data.",
        ) from exc
    return result
