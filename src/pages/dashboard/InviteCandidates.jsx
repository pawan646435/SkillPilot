// src/pages/dashboard/InviteCandidates.jsx
import { motion } from "framer-motion";
import { ArrowLeft, Send, Search, Mail, Loader2, CheckCircle2, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { db } from "../../lib/firebase";
import { doc, getDoc, collection, getDocs, addDoc, query, where, serverTimestamp } from "firebase/firestore";

export default function InviteCandidates() {
  const { id } = useParams();
  
  const [assessment, setAssessment] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(null);
  const [copiedLink, setCopiedLink] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch the assessment
        const assessSnap = await getDoc(doc(db, "assessments", id));
        if (assessSnap.exists()) setAssessment({ id: assessSnap.id, ...assessSnap.data() });

        // Fetch all users (candidates)
        const usersSnap = await getDocs(collection(db, "users"));
        setCandidates(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Fetch existing invites for THIS assessment
        const q = query(collection(db, "invites"), where("assessmentId", "==", id));
        const invitesSnap = await getDocs(q);
        setInvites(invitesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const alreadyInvitedIds = invites.map((inv) => inv.candidateId);
  const filteredCandidates = candidates.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()));

  const handleInvite = async (candidate) => {
    setSending(candidate.id);
    try {
      const inviteToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      const newInvite = {
        assessmentId: id,
        candidateId: candidate.id,
        candidateName: candidate.name || "Unknown",
        candidateEmail: candidate.email,
        status: "PENDING",
        token: inviteToken,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, "invites"), newInvite);
      setInvites(prev =>[...prev, { id: docRef.id, ...newInvite }]);
    } catch (err) {
      alert("Error sending invite: " + err.message);
    } finally {
      setSending(null);
    }
  };

  const copyInviteLink = (invite) => {
    // This creates the link they will actually click to take the test
    const link = `${window.location.origin}/assessment/invite/${invite.token}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(invite.id);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;

  return (
    <div className="flex flex-col w-full max-w-3xl gap-8 mx-auto">
      <div className="flex items-center gap-4">
        <Link to={`/dashboard/assessments/${id}`} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white transition-all">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-display">Invite Candidates</h1>
          <p className="mt-1 text-sm text-neutral-400">Send invites for: <span className="font-medium text-white">{assessment?.title}</span></p>
        </div>
      </div>

      {/* Already Invited List */}
      {invites.length > 0 && (
        <div className="p-6 border shadow-xl rounded-2xl bg-surface border-white/5">
          <h2 className="mb-4 text-sm font-bold tracking-widest uppercase text-neutral-500">Sent Invites ({invites.length})</h2>
          <div className="flex flex-col gap-3">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-4 rounded-xl bg-[#0a0a0a] border border-white/10">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-10 h-10 font-bold border rounded-xl bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                    {inv.candidateName?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <span className="block text-base font-semibold text-white font-display">{inv.candidateName}</span>
                    <span className="font-mono text-xs text-neutral-500">{inv.candidateEmail}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${inv.status === "ACCEPTED" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-400/10 text-amber-400"}`}>
                    {inv.status}
                  </span>
                  <button onClick={() => copyInviteLink(inv)} className="p-2 bg-white/[0.03] border border-white/10 text-neutral-400 hover:text-white hover:bg-white/[0.08] rounded-lg transition-all" title="Copy unique invite link">
                    {copiedLink === inv.id ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search and Invite New Candidates */}
      <div className="p-6 border shadow-xl rounded-2xl bg-surface border-white/5">
        <h2 className="mb-4 text-sm font-bold tracking-widest uppercase text-neutral-500">Available Candidates</h2>
        <div className="relative mb-6">
          <Search className="absolute w-4 h-4 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search database by name or email..." className="w-full pl-12 pr-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white text-sm focus:border-white/30 focus:outline-none transition-all" />
        </div>

        <div className="flex flex-col gap-3 pr-2 overflow-y-auto max-h-96 custom-scrollbar">
          {filteredCandidates.length === 0 ? (
            <div className="text-neutral-500 text-sm py-10 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.02] font-mono">No candidates found.</div>
          ) : (
            filteredCandidates.map((c) => {
              const isInvited = alreadyInvitedIds.includes(c.id);
              const isSending = sending === c.id;

              return (
                <motion.div key={c.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between p-4 rounded-xl bg-[#0a0a0a] border border-white/10 hover:border-white/20 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 font-bold border rounded-xl bg-white/5 border-white/10 text-neutral-300">
                      {c.name?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold tracking-wide text-white font-display">{c.name}</p>
                      <p className="text-[11px] font-mono text-neutral-500 flex items-center gap-1.5 mt-0.5"><Mail className="w-3 h-3" /> {c.email}</p>
                    </div>
                  </div>

                  <button onClick={() => handleInvite(c)} disabled={isInvited || isSending} className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wider uppercase flex items-center gap-2 transition-all border ${isInvited ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/[0.03] text-white border-white/10 hover:bg-white/10 hover:border-white/30 shadow-lg"} disabled:opacity-60`}>
                    {isInvited ? <><CheckCircle2 className="w-3.5 h-3.5" /> Invited</> : isSending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending</> : <><Send className="w-3.5 h-3.5" /> Invite</>}
                  </button>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
