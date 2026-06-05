"""
OCR Sidecar – FastAPI microservice.

Accepts a base64-encoded PDF, renders each page to a raster image using
poppler-utils (pdf2image) and runs Tesseract OCR on every page.

Endpoints:
  POST /ocr    – perform OCR on a PDF
  GET  /health – liveness probe
"""

from __future__ import annotations

import base64
import logging
import time
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pytesseract
from pdf2image import convert_from_bytes
from pdf2image.exceptions import (
    PDFInfoNotInstalledError,
    PDFPageCountError,
    PDFSyntaxError,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ocr-sidecar")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="OCR Sidecar", version="1.0.0")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class OcrRequest(BaseModel):
    """Incoming OCR request payload."""

    pdf: str  # base64-encoded PDF bytes
    dpi: Optional[int] = 150  # render resolution; higher = better quality but slower
    language: Optional[str] = "eng"  # Tesseract language code(s) e.g. "eng+deu"


class OcrResponse(BaseModel):
    """OCR result returned to the caller."""

    text: str
    pages: int
    durationMs: int
    success: bool
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
async def health() -> dict:
    """Liveness probe – returns 200 when the service is ready."""
    return {"status": "ok", "service": "ocr-sidecar"}


@app.post("/ocr", response_model=OcrResponse)
async def ocr_pdf(request: OcrRequest) -> OcrResponse:
    """
    Convert a base64-encoded PDF to text via OCR.

    Steps:
      1. Decode base64 → raw bytes
      2. Render PDF pages to PIL images (via poppler pdf2image)
      3. Run pytesseract on each image
      4. Return concatenated text + metadata
    """
    t0 = time.monotonic()

    # 1. Decode
    try:
        pdf_bytes = base64.b64decode(request.pdf)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 payload: {exc}") from exc

    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Empty PDF payload")

    # 2. Render PDF pages → images
    try:
        images = convert_from_bytes(
            pdf_bytes,
            dpi=request.dpi or 150,
            fmt="png",
        )
    except PDFInfoNotInstalledError as exc:
        logger.error("poppler not found: %s", exc)
        raise HTTPException(status_code=500, detail="poppler-utils not installed in container") from exc
    except (PDFPageCountError, PDFSyntaxError) as exc:
        logger.warning("Cannot render PDF: %s", exc)
        raise HTTPException(status_code=422, detail=f"Cannot render PDF: {exc}") from exc
    except Exception as exc:
        logger.error("PDF rendering failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"PDF rendering failed: {exc}") from exc

    if not images:
        raise HTTPException(status_code=422, detail="No pages could be rendered from the PDF")

    # 3. OCR each page
    page_texts: list[str] = []
    for i, img in enumerate(images):
        try:
            page_text = pytesseract.image_to_string(img, lang=request.language or "eng")
            page_texts.append(page_text)
            logger.debug("Page %d/%d OCR'd (%d chars)", i + 1, len(images), len(page_text))
        except pytesseract.TesseractNotFoundError as exc:
            logger.error("Tesseract binary not found: %s", exc)
            raise HTTPException(status_code=500, detail="tesseract-ocr not installed in container") from exc
        except Exception as exc:
            logger.warning("OCR failed for page %d: %s", i + 1, exc)
            page_texts.append("")  # don't abort; include blank page

    combined_text = "\n\f\n".join(page_texts).strip()
    duration_ms = int((time.monotonic() - t0) * 1000)

    logger.info(
        "OCR completed: %d pages, %d chars, %d ms",
        len(images),
        len(combined_text),
        duration_ms,
    )

    return OcrResponse(
        text=combined_text,
        pages=len(images),
        durationMs=duration_ms,
        success=True,
    )
