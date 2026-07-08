"""RAG context ingestion for the AI Interview Panel feature (Stage 1 of 4).

Stage 1 only: takes raw text (resume or job description), chunks it,
embeds each chunk, and stores the result in Firestore so a later stage
(multi-agent panel, Stage 2) can retrieve relevant context by similarity
search (see services/retrieval.py). Nothing here is wired into the existing
AI Interview flow (routers/interview.py) yet — this is a new, isolated
surface reachable only via POST /rag/ingest.
"""
import asyncio
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

from app.dependencies.auth import DecodedUser, require_auth
from app.services import embeddings
from app.services.chunking import chunk_with_metadata
from app.services.firestore_client import async_get, get_db

router = APIRouter(prefix="/rag", tags=["rag"])


class IngestRequest(BaseModel):
    session_id: str | None = None
    raw_text: str
    source_type: Literal["resume", "job_description"]


class IngestResponse(BaseModel):
    session_id: str
    chunk_count: int


@router.post("/ingest", response_model=IngestResponse)
async def ingest_context(body: IngestRequest, user: DecodedUser = Depends(require_auth)):
    raw_text = body.raw_text.strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="raw_text must not be empty.")

    db = get_db()

    if body.session_id:
        session_ref = db.collection("interviewSessions").document(body.session_id)
        existing = await async_get(session_ref)
        if existing.exists and existing.to_dict().get("uid") != user.uid:
            # Never reveal *why* — same "not found" a stranger's session_id gets.
            raise HTTPException(status_code=404, detail="Session not found.")
        is_new_session = not existing.exists
    else:
        session_ref = db.collection("interviewSessions").document()
        is_new_session = True

    chunks = chunk_with_metadata(raw_text)

    # Model inference is CPU-bound and synchronous, just like the blocking
    # Firestore calls wrapped in firestore_client.py's async_* helpers — run
    # it on a worker thread so one ingest request can't stall every other
    # request the event loop is juggling.
    chunk_texts = [chunk["text"] for chunk in chunks]
    vectors = await asyncio.to_thread(embeddings.embed_batch, chunk_texts)

    chunks_ref = session_ref.collection("contextChunks")
    existing_chunks = await async_get(chunks_ref)
    order_offset = len(existing_chunks)

    def _write_chunks_and_session():
        batch = db.batch()
        for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
            chunk_doc_ref = chunks_ref.document()
            batch.set(chunk_doc_ref, {
                "text": chunk["text"],
                "embedding": vector,
                "order": order_offset + i,
                "tokenCount": chunk["tokenCount"],
            })

        session_data = {
            "uid": user.uid,
            "status": "CONTEXT_READY",
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        if is_new_session:
            session_data["config"] = {}
            session_data["createdAt"] = firestore.SERVER_TIMESTAMP
        batch.set(session_ref, session_data, merge=True)

        batch.commit()

    await asyncio.to_thread(_write_chunks_and_session)

    return IngestResponse(session_id=session_ref.id, chunk_count=len(chunks))
