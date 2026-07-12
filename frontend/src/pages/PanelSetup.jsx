// src/pages/PanelSetup.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion as Motion } from "framer-motion";
import { Users, ChevronRight, Loader2, TriangleAlert, CheckCircle2, Upload, FileText, X, GraduationCap, Briefcase } from "lucide-react";
import { useAuth } from "../context/authContextStore";
import { ingestPanelContext, ingestPanelContextFile } from "../services/ragService";
import Noise from "../components/Noise";
import BackgroundGlow from "../components/BackgroundGlow";

const MIN_LENGTH = 50;
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // mirrors the backend's limit -- fail fast client-side too

const EXPERIENCE_LEVELS = [
  {
    id: "fresher",
    label: "Fresher",
    description: "New grad / early-career — questions focus on fundamentals and reasoning.",
    Icon: GraduationCap,
  },
  {
    id: "experienced",
    label: "Experienced",
    description: "Professional experience — questions probe tradeoffs, scale, and ownership.",
    Icon: Briefcase,
  },
];

function hasAcceptedExtension(filename) {
  const lower = (filename || "").toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function PanelSetup() {
  const navigate = useNavigate();
  const { user, authReady } = useAuth();
  const [experienceLevel, setExperienceLevel] = useState("experienced");
  const [mode, setMode] = useState("paste"); // "paste" | "upload"
  const [rawText, setRawText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSlowNotice, setShowSlowNotice] = useState(false);
  const [error, setError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null); // { chunkCount } while the brief confirmation shows
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (authReady && !user) {
      navigate("/login?redirect=%2Finterview%2Fselect");
    }
  }, [authReady, user, navigate]);

  // Same honest-loading principle as Jobs.jsx's cold-fetch notice: embedding
  // a resume (sentence-transformers inference + Firestore batch write) is a
  // real backend operation, not instant. A bare spinner reads as "stuck" past
  // a second or two, so only surface the explanation once the wait has
  // actually gone on long enough to need one.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setShowSlowNotice(true), 2000);
    return () => {
      clearTimeout(timer);
      setShowSlowNotice(false);
    };
  }, [loading]);

  const trimmed = rawText.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_LENGTH;

  function pickFile(file) {
    setError(null);
    if (!file) return;
    if (!hasAcceptedExtension(file.name)) {
      setError(`Unsupported file type. Please upload a PDF or DOCX file (got: "${file.name}").`);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Please upload a file under 5MB, or paste the text instead.`);
      return;
    }
    setSelectedFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  const handleStartPaste = async () => {
    if (trimmed.length < MIN_LENGTH) {
      setError(`Paste a bit more detail (at least ${MIN_LENGTH} characters) so the panel has something real to ground questions in.`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await ingestPanelContext(trimmed);
      navigate("/interview/panel/room", { state: { sessionId: data.session_id, experienceLevel } });
    } catch (err) {
      setError(err.message || "Could not process your resume right now. Please try again.");
      setLoading(false);
    }
  };

  const handleStartUpload = async () => {
    if (!selectedFile) return;
    setError(null);
    setLoading(true);
    try {
      const data = await ingestPanelContextFile(selectedFile);
      // Real, honest confirmation using the actual chunk_count the backend
      // returned -- not a generic "success" message -- so the user has some
      // evidence their file was genuinely read, not silently accepted.
      setUploadSuccess({ chunkCount: data.chunk_count, sessionId: data.session_id });
      window.setTimeout(() => {
        navigate("/interview/panel/room", { state: { sessionId: data.session_id, experienceLevel } });
      }, 1400);
    } catch (err) {
      setError(err.message || "Could not process your file right now. Please try again, or paste the text instead.");
      setLoading(false);
    }
  };

  if (!authReady || !user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-neutral-400 font-mono text-sm">
        {authReady ? "Redirecting to login..." : "Checking session..."}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] relative overflow-hidden flex items-center justify-center">
      <Noise />
      <BackgroundGlow />

      <div className="relative z-10 w-full max-w-2xl px-6 py-16 mx-auto">
        <Motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-2xl bg-white/[0.04] border border-white/10">
            <Users className="w-8 h-8 text-sky-400" />
          </div>
          <h1 className="mb-3 text-4xl font-semibold tracking-tight text-white font-display">
            AI Panel Interview
          </h1>
          <p className="text-neutral-400 text-sm max-w-md mx-auto leading-relaxed">
            Paste your resume or a job description below. The Technical Interviewer and
            Hiring Manager will ground their questions in what you actually wrote.
          </p>
        </Motion.div>

        <Motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="p-8 rounded-2xl bg-white/[0.03] border border-white/10 space-y-5"
        >
          {/* Experience level */}
          <div>
            <label className="block mb-3 text-sm font-medium text-neutral-300">
              Experience level
            </label>
            <div className="grid grid-cols-2 gap-3">
              {EXPERIENCE_LEVELS.map((level) => {
                const isActive = experienceLevel === level.id;
                return (
                  <button
                    key={level.id}
                    onClick={() => setExperienceLevel(level.id)}
                    disabled={loading}
                    className={`p-4 rounded-xl border transition-all duration-200 text-left disabled:opacity-50 ${
                      isActive
                        ? "bg-sky-400/10 border-sky-400"
                        : "bg-white/[0.02] border-white/5 hover:border-white/20"
                    }`}
                  >
                    <level.Icon className={`w-5 h-5 mb-2 ${isActive ? "text-sky-400" : "text-neutral-600"}`} />
                    <p className={`text-sm font-semibold ${isActive ? "text-white" : "text-neutral-400"}`}>
                      {level.label}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-600">{level.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setMode("paste"); setError(null); }}
              disabled={loading}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border disabled:opacity-50 ${
                mode === "paste"
                  ? "bg-white/10 border-white/30 text-white"
                  : "bg-white/[0.02] border-white/5 text-neutral-500 hover:text-white hover:border-white/15"
              }`}
            >
              Paste Text
            </button>
            <button
              onClick={() => { setMode("upload"); setError(null); }}
              disabled={loading}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border disabled:opacity-50 ${
                mode === "upload"
                  ? "bg-white/10 border-white/30 text-white"
                  : "bg-white/[0.02] border-white/5 text-neutral-500 hover:text-white hover:border-white/15"
              }`}
            >
              Upload File
            </button>
          </div>

          {mode === "paste" ? (
            <div>
              <label className="block mb-3 text-sm font-medium text-neutral-300">
                Resume / job description
              </label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                disabled={loading}
                placeholder="Paste your resume text here..."
                rows={12}
                className="w-full p-5 rounded-2xl bg-white/[0.03] border border-white/10 text-[#ededed] placeholder-neutral-700 text-sm leading-relaxed resize-none focus:outline-none focus:border-white/20 transition-colors font-mono disabled:opacity-50"
              />
              <p className={`mt-2 text-xs ${tooShort ? "text-amber-400" : "text-neutral-600"}`}>
                {trimmed.length} characters {tooShort && `— at least ${MIN_LENGTH} needed`}
              </p>
            </div>
          ) : (
            <div>
              <label className="block mb-3 text-sm font-medium text-neutral-300">
                Resume / job description file
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                onChange={(e) => pickFile(e.target.files?.[0])}
                disabled={loading}
                className="hidden"
              />
              {selectedFile ? (
                <div className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.03] border border-white/10">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-sky-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{selectedFile.name}</p>
                      <p className="text-xs text-neutral-600">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                  </div>
                  {!loading && (
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="p-2 text-neutral-500 hover:text-white transition-colors shrink-0"
                      aria-label="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  disabled={loading}
                  className={`w-full flex flex-col items-center justify-center gap-3 py-12 rounded-2xl border-2 border-dashed transition-colors disabled:opacity-50 ${
                    dragActive
                      ? "border-sky-400/50 bg-sky-400/5"
                      : "border-white/10 hover:border-white/20 bg-white/[0.02]"
                  }`}
                >
                  <Upload className={`w-8 h-8 ${dragActive ? "text-sky-400" : "text-neutral-600"}`} />
                  <div className="text-center">
                    <p className="text-sm text-neutral-300">
                      Drag and drop, or <span className="text-sky-400 font-medium">browse</span>
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">PDF or DOCX, up to 5MB</p>
                  </div>
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 text-sm border rounded-xl bg-rose-400/10 border-rose-400/20 text-rose-300">
              <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {uploadSuccess ? (
            <div className="flex items-center gap-3 p-4 text-sm border rounded-xl bg-emerald-400/10 border-emerald-400/20 text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Resume uploaded — {uploadSuccess.chunkCount} section{uploadSuccess.chunkCount === 1 ? "" : "s"} detected.
                Starting your panel interview...
              </span>
            </div>
          ) : (
            <>
              {loading && showSlowNotice && (
                <div className="p-4 text-sm border rounded-xl bg-sky-400/10 border-sky-400/20 text-sky-200">
                  {mode === "upload"
                    ? "Reading your file and preparing the panel — this can take a few seconds for a longer document."
                    : "Reading your resume and preparing the panel — this can take a few seconds the first time."}
                </div>
              )}

              <button
                onClick={mode === "paste" ? handleStartPaste : handleStartUpload}
                disabled={loading || (mode === "paste" ? trimmed.length < MIN_LENGTH : !selectedFile)}
                className="flex items-center justify-center w-full gap-2 px-6 py-3.5 bg-white text-black font-semibold rounded-xl hover:bg-neutral-100 transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-[1.01] text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Preparing panel...
                  </>
                ) : (
                  <>
                    Start Panel Interview
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          )}
        </Motion.div>
      </div>
    </div>
  );
}
