"""Retrieves the most relevant context chunks for a session by embedding
similarity (Stage 1 of the RAG pipeline). Not called by any endpoint yet —
Stage 2 (multi-agent panel) will use this to pull relevant resume/JD context
into interview question generation.

Cosine similarity is computed by hand with numpy rather than a vector
database. At the scale of a single interview session (tens of chunks, not
thousands), brute-force comparison against every stored vector is
sub-millisecond work — a vector DB (Pinecone, pgvector, etc.) only starts
paying for itself once a single query has to search across tens of
thousands+ of vectors, where an approximate-nearest-neighbor index
meaningfully beats a linear scan. Neither condition holds here.
"""
import asyncio

import numpy as np

from app.services.embeddings import embed_text
from app.services.firestore_client import async_get, get_db


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """cos(theta) = (a . b) / (||a|| * ||b||) — the dot product of the two
    vectors, normalized by their magnitudes so only the *direction* (not the
    length) of each vector affects the score."""
    a_vec, b_vec = np.array(a), np.array(b)
    return float(np.dot(a_vec, b_vec) / (np.linalg.norm(a_vec) * np.linalg.norm(b_vec)))


async def retrieve_relevant_chunks(session_id: str, query_text: str, top_k: int = 3) -> list[dict]:
    """Returns up to top_k chunks for the session, sorted by descending
    similarity to query_text."""
    query_vector = await asyncio.to_thread(embed_text, query_text)

    db = get_db()
    chunks_ref = db.collection("interviewSessions").document(session_id).collection("contextChunks")
    docs = await async_get(chunks_ref)

    scored = [
        {
            "text": doc.to_dict()["text"],
            "order": doc.to_dict()["order"],
            "similarity": _cosine_similarity(query_vector, doc.to_dict()["embedding"]),
        }
        for doc in docs
    ]
    scored.sort(key=lambda item: item["similarity"], reverse=True)
    return scored[:top_k]
