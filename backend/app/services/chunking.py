"""Splits raw text (resume, job description) into overlapping chunks before
embedding (Stage 1 RAG ingestion).

We chunk instead of embedding the whole document as one vector because a
single vector for a multi-paragraph document has to compress every fact into
one point, blurring specifics together. Smaller chunks let retrieval later
point at the specific paragraph that's relevant to a question instead of a
vague whole-document average.

Overlap exists because sentence/paragraph boundaries rarely align with the
ideas we care about — a fact can be split across a chunk boundary (e.g. a
sentence naming a result immediately after a sentence naming the technique
that produced it). Repeating the tail of one chunk at the head of the next
means a fact near a boundary is very likely to appear whole in at least one
chunk.
"""
import re

_TARGET_TOKENS = 400  # midpoint of the requested ~300-500 token range
_OVERLAP_RATIO = 0.175  # midpoint of the requested ~15-20% overlap
_CHARS_PER_TOKEN = 4  # rough English heuristic (no tokenizer dependency here)

_TARGET_CHARS = _TARGET_TOKENS * _CHARS_PER_TOKEN
_OVERLAP_CHARS = int(_TARGET_CHARS * _OVERLAP_RATIO)

_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)


def _split_into_sentences(paragraph: str) -> list[str]:
    """Splits a paragraph into sentences, falling back to the whole
    paragraph if it has no sentence-ending punctuation (e.g. a resume
    bullet list line)."""
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(paragraph) if s.strip()]
    return sentences or [paragraph.strip()]


def chunk_text(text: str) -> list[str]:
    """Splits text into overlapping, order-preserving chunks.

    Builds chunks by accumulating whole sentences (never splitting a
    sentence mid-word) up to ~_TARGET_TOKENS tokens, preferring paragraph
    breaks as chunk boundaries when a paragraph alone is close to the
    target size. Each new chunk starts by carrying over the last
    ~_OVERLAP_CHARS characters of the previous chunk.
    """
    text = text.strip()
    if not text:
        return []

    paragraphs = [p.strip() for p in _PARAGRAPH_SPLIT.split(text) if p.strip()]
    sentences: list[str] = []
    for paragraph in paragraphs:
        sentences.extend(_split_into_sentences(paragraph))

    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        candidate = f"{current} {sentence}".strip() if current else sentence

        if current and len(candidate) > _TARGET_CHARS:
            chunks.append(current)
            # Carry the tail of the finished chunk into the next one so a
            # fact split across this boundary still appears whole somewhere.
            tail = current[-_OVERLAP_CHARS:] if _OVERLAP_CHARS < len(current) else current
            current = f"{tail} {sentence}".strip()
        else:
            current = candidate

    if current:
        chunks.append(current)

    return chunks


def chunk_with_metadata(text: str) -> list[dict]:
    """Returns chunks with their order index and estimated token count,
    matching the contextChunks/{chunkId} schema fields (order, tokenCount)."""
    return [
        {"text": chunk, "order": i, "tokenCount": _estimate_tokens(chunk)}
        for i, chunk in enumerate(chunk_text(text))
    ]
