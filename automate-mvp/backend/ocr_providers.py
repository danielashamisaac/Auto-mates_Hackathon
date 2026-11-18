import base64
import io
import logging
import os
import time
from statistics import mean

GEMINI_MODEL = "gemini-3.8-flash"
GEMINI_TIMEOUT_MS = int(os.getenv("GEMINI_TIMEOUT_MS", "120000"))
logger = logging.getLogger(__name__)


def _with_gemini_retries(operation, *args):
    for attempt in range(3):
        try:
            return operation(*args)
        except Exception as exc:
            if getattr(exc, "status_code", None) != 503 or attempt == 2:
                raise
            delay = 2 ** attempt
            logger.warning(
                "Gemini returned 503; retrying attempt %s/3 in %s seconds.",
                attempt + 2,
                delay,
            )
            time.sleep(delay)


def _is_truthy(value):
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _gemini_enabled():
    return _is_truthy(os.getenv("OCR_ALLOW_GEMINI_FALLBACK", "false"))


def _gemini_api_key():
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")


def _gemini_client():
    api_key = _gemini_api_key()
    if not api_key:
        raise RuntimeError("Gemini OCR was selected but GEMINI_API_KEY is not configured in the backend environment.")

    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:
        raise RuntimeError("Gemini OCR requires the google-genai package. Install backend requirements and restart the server.") from exc

    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS),
    )


def _gemini_ocr(client, image):
    output = io.BytesIO()
    image.save(output, format="PNG")
    from google.genai import interactions

    response = client.interactions.create(
        model=GEMINI_MODEL,
        input=[
            interactions.TextContent(
                text="Read this registration form and transcribe its visible text exactly. Preserve field labels and line breaks. Do not infer missing values or add explanations."
            ),
            interactions.ImageContent(
                data=base64.b64encode(output.getvalue()).decode("ascii"),
                mime_type="image/png",
            ),
        ],
    )
    text = getattr(response, "output_text", "")
    if not text:
        raise RuntimeError("Gemini OCR returned no text.")
    return text.strip()


def parse_scan_pages(filename, content):
    extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if extension not in {"pdf", "png", "jpg", "jpeg", "tif", "tiff", "webp"}:
        raise ValueError("Upload a PDF or image file (PNG, JPG, TIFF, or WEBP).")

    import fitz
    import pytesseract
    from PIL import Image

    if os.getenv("TESSERACT_CMD"):
        pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]

    images = []
    if extension == "pdf":
        try:
            document = fitz.open(stream=content, filetype="pdf")
        except Exception as exc:
            raise ValueError("Could not read this PDF. It may be damaged or password-protected.") from exc
        if document.page_count == 0 or document.page_count > 20:
            document.close()
            raise ValueError("A scanned PDF must contain between 1 and 20 pages.")
        try:
            for page in document:
                scale = min(2, 2400 / max(page.rect.width, page.rect.height))
                pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                images.append(Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples))
        finally:
            document.close()
    else:
        try:
            with Image.open(io.BytesIO(content)) as source:
                if source.width * source.height > 40_000_000:
                    raise ValueError("Image dimensions are too large to process safely.")
                images.append(source.convert("RGB"))
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("Could not read this image file.") from exc

    provider = os.getenv("OCR_PROVIDER", "tesseract").strip().lower()
    allow_fallback = _gemini_enabled()
    if provider not in {"tesseract", "gemini"}:
        raise RuntimeError("OCR_PROVIDER must be either 'tesseract' or 'gemini'.")
    if provider == "gemini" and not _gemini_api_key():
        raise RuntimeError("OCR_PROVIDER is set to gemini, but GEMINI_API_KEY is missing from the backend environment.")

    results = []
    client = None
    try:
        for image in images:
            if provider == "gemini":
                try:
                    if client is None:
                        client = _gemini_client()
                    text = _with_gemini_retries(_gemini_ocr, client, image)
                    results.append({"text": text, "provider": "gemini", "confidence": None, "warning": None})
                except Exception as exc:
                    local = _tesseract_ocr(image, pytesseract)
                    local["warning"] = f"Gemini was unavailable; local OCR was used ({type(exc).__name__})."
                    results.append(local)
                continue

            try:
                local = _tesseract_ocr(image, pytesseract)
            except Exception as exc:
                if not (allow_fallback and _gemini_api_key()):
                    raise RuntimeError("Local OCR failed. Check Tesseract installation or explicitly enable Gemini fallback.") from exc
                try:
                    if client is None:
                        client = _gemini_client()
                    text = _with_gemini_retries(_gemini_ocr, client, image)
                    results.append({"text": text, "provider": "gemini", "confidence": None, "warning": f"Gemini was used because local OCR failed ({type(exc).__name__}). Verify this page manually."})
                    continue
                except Exception as gemini_exc:
                    raise RuntimeError("Both local OCR and the enabled Gemini fallback failed.") from gemini_exc

            threshold = float(os.getenv("OCR_GEMINI_CONFIDENCE_THRESHOLD", "65"))
            if not 0 <= threshold <= 100:
                raise RuntimeError("OCR_GEMINI_CONFIDENCE_THRESHOLD must be between 0 and 100.")
            should_fallback = allow_fallback and _gemini_api_key() and (
                local["confidence"] is None or local["confidence"] < threshold
            )
            if should_fallback:
                try:
                    if client is None:
                        client = _gemini_client()
                    text = _with_gemini_retries(_gemini_ocr, client, image)
                    results.append({"text": text, "provider": "gemini", "confidence": None, "warning": f"Gemini used because local OCR confidence was below {threshold:.0f}%. Verify this page manually."})
                    continue
                except Exception as exc:
                    local["warning"] = f"Gemini fallback failed ({type(exc).__name__}); local OCR was retained."
            results.append(local)
    finally:
        for image in images:
            image.close()
    return results


def _tesseract_ocr(image, pytesseract):
    from pytesseract import Output

    text = pytesseract.image_to_string(image, lang="eng").strip()
    data = pytesseract.image_to_data(image, lang="eng", output_type=Output.DICT)
    confidences = []
    for token, value in zip(data["text"], data["conf"]):
        if token.strip():
            try:
                confidence = float(value)
            except (TypeError, ValueError):
                continue
            if confidence >= 0:
                confidences.append(confidence)
    return {
        "text": text,
        "provider": "tesseract",
        "confidence": round(mean(confidences), 1) if confidences else None,
        "warning": None,
    }