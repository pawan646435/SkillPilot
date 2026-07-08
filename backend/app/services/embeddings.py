"""Text embedding generation for RAG context ingestion (Stage 1).

Uses sentence-transformers' all-MiniLM-L6-v2: a small (~90MB) model that maps
any input text to a 384-dimensional vector such that semantically similar
text produces vectors that are close together (see retrieval.py's cosine
similarity, which is the thing that actually measures "close together").

The model is loaded ONCE at import time, not inside a request handler. Model
loading reads ~90MB of weights off disk and initializes the underlying
torch model — on the order of 1-3 seconds. On Cloud Run, each container
instance imports this module once at cold start; loading it per-request
would pay that cost on every single call to /rag/ingest instead of once per
instance lifetime.
"""
from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"
_model = SentenceTransformer(_MODEL_NAME)


def embed_text(text: str) -> list[float]:
    """Embeds a single string into a 384-dim vector."""
    return _model.encode(text, convert_to_numpy=True).tolist()


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embeds multiple strings in one batched forward pass.

    Batching is meaningfully faster than calling embed_text in a loop since
    the model processes the whole batch as one padded tensor operation
    instead of one Python-level call per chunk.
    """
    if not texts:
        return []
    return _model.encode(texts, convert_to_numpy=True).tolist()
