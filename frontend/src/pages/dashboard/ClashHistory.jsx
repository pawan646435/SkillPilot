import { useEffect, useState } from "react";
import { db, auth } from "../../lib/firebase";
import { collection, getDocs, limit, query, where, orderBy } from "firebase/firestore";
import { Swords } from "lucide-react";

export default function ClashHistory() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const player1Query = query(collection(db, "battles"), where("player1.uid", "==", user.uid), orderBy("updatedAt", "desc"), limit(30));
        const player2Query = query(collection(db, "battles"), where("player2.uid", "==", user.uid), orderBy("updatedAt", "desc"), limit(30));

        const [p1, p2] = await Promise.all([getDocs(player1Query), getDocs(player2Query)]);
        const map = {};
        [...p1.docs, ...p2.docs].forEach((docSnap) => {
          map[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });

        const merged = Object.values(map).sort((a, b) => (b?.updatedAt?.seconds || 0) - (a?.updatedAt?.seconds || 0));
        setMatches(merged);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, []);

  if (loading) {
    return <div className="text-neutral-400">Loading clash history...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Clash History</h1>
        <p className="text-sm text-neutral-400">Track previous practical battles and outcomes.</p>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-neutral-400">
          <Swords className="w-8 h-8 mx-auto mb-3" />
          No matches yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-neutral-300">
              <tr>
                <th className="text-left p-3">Room</th>
                <th className="text-left p-3">Stack</th>
                <th className="text-left p-3">Opponent</th>
                <th className="text-left p-3">Score</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => {
                const myUid = auth.currentUser?.uid;
                const isPlayer1 = match?.player1?.uid === myUid;
                const opponent = isPlayer1 ? (match?.player2?.name || "Waiting") : (match?.player1?.name || "Unknown");
                const myScore = isPlayer1 ? (match?.scores?.[match?.player1?.uid] || 0) : (match?.scores?.[match?.player2?.uid] || 0);
                const opScore = isPlayer1 ? (match?.scores?.[match?.player2?.uid] || 0) : (match?.scores?.[match?.player1?.uid] || 0);
                const result = myScore === opScore ? "DRAW" : myScore > opScore ? "WIN" : "LOSS";

                return (
                  <tr key={match.id} className="border-t border-white/10">
                    <td className="p-3 font-mono text-xs text-white">{match.id}</td>
                    <td className="p-3 text-neutral-300">{match?.config?.stack || "GENERAL"}</td>
                    <td className="p-3 text-neutral-300">{opponent}</td>
                    <td className="p-3 text-white">{myScore} - {opScore}</td>
                    <td className={`p-3 font-semibold ${result === "WIN" ? "text-emerald-400" : result === "LOSS" ? "text-rose-400" : "text-amber-400"}`}>{result}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
