"""Extracts plain text from an uploaded resume/job-description file (PDF or
DOCX) so it can feed the same chunk/embed pipeline rag.py already runs for
pasted text. Chosen over client-side (browser) extraction because this
backend already owns the entire text pipeline end to end (chunking,
embedding) -- extraction is one more step in that same pipeline, using
mature, well-tested Python libraries rather than adding a second,
JS-flavored extraction path the backend would have to trust blindly.

pypdf, not pdfplumber, for PDF: a real side-by-side on a two-column resume
section showed pdfplumber's geometric row-reconstruction merges unrelated
columns onto the same line (e.g. "- Python - Kubernetes"), which would
embed two unrelated skills as one confused chunk. pypdf's simpler
draw-order text dump kept each line clean. pypdf also has zero transitive
dependencies versus pdfplumber's pdfminer.six/Pillow/pypdfium2.
"""
import io

import pypdf
from docx import Document

_SUPPORTED_EXTENSIONS = {".pdf", ".docx"}


class ExtractionError(Exception):
    """Raised when a file can't be read -- callers should turn this into a
    plain-language 400, never a raw 500."""


def _extract_pdf(data: bytes) -> str:
    try:
        reader = pypdf.PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:  # noqa: BLE001 - any pypdf failure means "can't read this file"
        raise ExtractionError("Couldn't read this PDF. It may be corrupted, scanned as images "
                               "rather than text, or password-protected.") from exc


def _extract_docx(data: bytes) -> str:
    try:
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as exc:  # noqa: BLE001 - any python-docx failure means "can't read this file"
        raise ExtractionError("Couldn't read this DOCX file. It may be corrupted or in an "
                               "unsupported format.") from exc


def extract_text(filename: str, data: bytes) -> str:
    """Dispatches on the file's extension (not the client-supplied
    Content-Type, which is easy to get wrong or spoof and isn't worth
    trusting for a resume-upload feature). Raises ExtractionError for
    unsupported extensions or files that fail to parse."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        text = _extract_pdf(data)
    elif name.endswith(".docx"):
        text = _extract_docx(data)
    else:
        raise ExtractionError(
            f"Unsupported file type. Please upload a PDF or DOCX file (got: {filename!r})."
        )

    if not text.strip():
        raise ExtractionError(
            "Couldn't find any text in this file. If it's a scanned image rather than "
            "selectable text, try pasting the content instead."
        )
    return text
