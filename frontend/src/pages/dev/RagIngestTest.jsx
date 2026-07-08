// src/pages/dev/RagIngestTest.jsx
//
// Dev-only test surface for Stage 1 of the AI Interview Panel (RAG
// ingestion). Not linked from any nav — reachable directly at
// /dev/rag-ingest-test. Paste resume/JD text, ingest it, and see the
// resulting chunk count and chunk text so ingestion can be sanity-checked
// without needing to open the Firestore console.
import { useState } from "react";
import { useAuth } from "../../context/authContextStore";
import { fetchSessionChunks, ingestInterviewContext } from "../../services/ragService";

export default function RagIngestTest() {
  const { user, authReady } = useAuth();
  const [rawText, setRawText] = useState("");
  const [sourceType, setSourceType] = useState("resume");
  const [sessionId, setSessionId] = useState("");
  const [result, setResult] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleIngest() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await ingestInterviewContext(rawText, sourceType, sessionId || undefined);
      setResult(data);
      setSessionId(data.session_id);
      const sessionChunks = await fetchSessionChunks(data.session_id);
      setChunks(sessionChunks);
    } catch (err) {
      setError(err.message || "Ingestion failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 font-mono p-8 max-w-3xl mx-auto">
      <h1 className="text-xl mb-1">RAG Ingestion Test (Stage 1, dev only)</h1>
      <p className="text-neutral-500 text-sm mb-6">
        POST /rag/ingest — paste text, ingest, inspect the resulting chunks.
      </p>

      {!authReady ? (
        <p className="text-neutral-500">Checking auth...</p>
      ) : !user ? (
        <p className="text-amber-400">You must be logged in to call /rag/ingest (it's behind require_auth).</p>
      ) : (
        <>
          <div className="mb-4 flex gap-3 items-center text-sm">
            <label>
              source_type:{" "}
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
              >
                <option value="resume">resume</option>
                <option value="job_description">job_description</option>
              </select>
            </label>
            <label className="flex-1">
              session_id (optional, reuse to append):{" "}
              <input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="leave blank to create a new session"
                className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full"
              />
            </label>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={12}
            placeholder="Paste resume or job description text here..."
            className="w-full bg-neutral-900 border border-neutral-700 rounded p-3 text-sm mb-4"
          />

          <button
            onClick={handleIngest}
            disabled={loading || !rawText.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-black font-semibold px-4 py-2 rounded text-sm"
          >
            {loading ? "Ingesting..." : "Ingest"}
          </button>

          {error && <p className="text-rose-400 mt-4 text-sm">{error}</p>}

          {result && (
            <div className="mt-6 text-sm">
              <p className="text-emerald-400 mb-4">
                session_id: {result.session_id} — chunk_count: {result.chunk_count}
              </p>
              <div className="space-y-3">
                {chunks.map((chunk) => (
                  <div key={chunk.id} className="border border-neutral-800 rounded p-3">
                    <p className="text-neutral-500 mb-1">
                      order {chunk.order} — ~{chunk.tokenCount} tokens — embedding dims: {chunk.embedding?.length}
                    </p>
                    <p className="text-neutral-300 whitespace-pre-wrap">{chunk.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
