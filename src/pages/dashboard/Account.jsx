// src/pages/dashboard/Account.jsx
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Mail, Phone, FileText, Camera, Shield, Key, Check, X, Loader2, Eye, EyeOff, Calendar, BadgeCheck, AlertCircle } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { auth, db, storage } from "../../lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function Account() {
  const { dashboardUser, dashboardAuthReady } = useOutletContext();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const[uploadingAvatar, setUploadingAvatar] = useState(false);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  // Profile form
  const[profileForm, setProfileForm] = useState({ name: "", phone: "", bio: "" });

  // Password change
  const [pwStep, setPwStep] = useState("idle"); // idle | editing
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwChanging, setPwChanging] = useState(false);

  useEffect(() => {
    if (!dashboardAuthReady) {
      return;
    }

    if (dashboardUser) {
      setUser(dashboardUser);
      setProfileForm({
        name: dashboardUser.name || dashboardUser.displayName || "",
        phone: dashboardUser.phone || "",
        bio: dashboardUser.bio || "",
      });
    } else {
      setUser(null);
    }

    setLoading(false);
  }, [dashboardUser, dashboardAuthReady]);

  const getDisplayName = () => {
    return user?.name || user?.displayName || user?.email?.split("@")[0] || "User";
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Save Profile to Auth & Firestore ──
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: profileForm.name });
        await updateDoc(doc(db, "users", auth.currentUser.uid), profileForm);
        setUser((prev) => ({ ...prev, ...profileForm }));
        showToast("Profile updated successfully");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Avatar Upload via Firebase Storage ──
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showToast("Image must be under 5 MB", "error");

    setUploadingAvatar(true);
    try {
      const storageRef = ref(storage, `avatars/${auth.currentUser.uid}`);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);
      
      await updateProfile(auth.currentUser, { photoURL });
      await updateDoc(doc(db, "users", auth.currentUser.uid), { photoURL });
      
      setUser((prev) => ({ ...prev, photoURL }));
      showToast("Profile picture updated");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Password Change via Firebase Auth ──
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return showToast("Passwords don't match", "error");
    if (newPassword.length < 6) return showToast("Password must be at least 6 characters", "error");

    setPwChanging(true);
    try {
      // Re-authenticate user first (required by Firebase for security)
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      // Update password
      await updatePassword(auth.currentUser, newPassword);
      showToast("Password changed successfully");
      setPwStep("idle");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err) {
      showToast("Incorrect current password or error updating.", "error");
    } finally {
      setPwChanging(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>;
  if (!user) return <div className="py-20 text-center text-rose-400">Please login.</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl border backdrop-blur-sm shadow-lg flex items-center gap-2 text-sm font-bold tracking-wide uppercase ${toast.type === "error" ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"}`}>
            {toast.type === "error" ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />} {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-white font-display">Account</h1>
        <p className="text-sm text-neutral-400">Manage your profile, avatar, and security settings.</p>
      </div>

      {/* ── AVATAR + BASIC INFO CARD ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-surface border border-white/[0.05] rounded-2xl p-6 mb-6 shadow-xl">
        <div className="flex items-center gap-6">
          <div className="relative group">
            <div onClick={() => fileInputRef.current?.click()} className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-white/10 cursor-pointer hover:border-emerald-500/50 transition-all bg-[#0a0a0a] flex items-center justify-center">
              {uploadingAvatar ? (
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              ) : user.photoURL ? (
                <img src={user.photoURL} alt={user.name} className="object-cover w-full h-full" />
              ) : (
                <span className="text-3xl font-bold font-display text-neutral-600">{user.name?.charAt(0).toUpperCase() || "U"}</span>
              )}
              <div className="absolute inset-0 flex items-center justify-center transition-opacity opacity-0 bg-black/60 group-hover:opacity-100 rounded-2xl">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          </div>

          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white font-display">{getDisplayName()}</h2>
            <p className="mt-1 font-mono text-sm text-neutral-500">{user.email}</p>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest ${user.role === "ADMIN" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"}`}>
                <BadgeCheck className="w-3.5 h-3.5" /> {user.role || "USER"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-500">
                <Calendar className="w-3.5 h-3.5" /> Joined {user.createdAt?.toDate ? user.createdAt.toDate().toLocaleDateString() : "Recently"}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── PROFILE FORM ── */}
      <motion.form onSubmit={handleSaveProfile} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-surface border border-white/[0.05] rounded-2xl p-6 mb-6 shadow-xl">
        <h3 className="flex items-center gap-2 mb-5 text-sm font-bold tracking-widest uppercase text-neutral-500">
          <User className="w-4 h-4" /> Personal Information
        </h3>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Full Name</label>
            <div className="relative">
              <User className="absolute w-4 h-4 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
              <input type="text" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-white/30 focus:outline-none transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute w-4 h-4 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
              <input type="email" value={user.email} disabled className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl pl-12 pr-4 py-3 text-sm text-neutral-600 cursor-not-allowed" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Phone Number</label>
            <div className="relative">
              <Phone className="absolute w-4 h-4 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
              <input type="tel" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+1 (555) 000-0000" className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-white/30 focus:outline-none transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Role</label>
            <div className="relative">
              <Shield className="absolute w-4 h-4 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
              <input type="text" value={user.role || "USER"} disabled className="w-full bg-[#0a0a0a] border border-white/5 rounded-xl pl-12 pr-4 py-3 text-sm text-neutral-600 cursor-not-allowed" />
            </div>
          </div>
        </div>

        <div className="mt-5">
          <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Bio</label>
          <div className="relative">
            <FileText className="absolute left-4 top-3.5 w-4 h-4 text-neutral-500" />
            <textarea value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} rows={3} maxLength={500} placeholder="Tell us a little about yourself..." className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-white/30 focus:outline-none transition-all resize-none" />
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-3 text-sm font-bold tracking-wider text-black uppercase transition-all bg-white rounded-xl hover:bg-neutral-200 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </motion.form>

      {/* ── PASSWORD / SECURITY ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-surface border border-white/[0.05] rounded-2xl p-6 mb-6 shadow-xl">
        <h3 className="flex items-center gap-2 mb-2 text-sm font-bold tracking-widest uppercase text-neutral-500">
          <Key className="w-4 h-4" /> Security
        </h3>
        <p className="mb-6 text-sm text-neutral-400">Update your account password. Requires re-authentication.</p>

        {pwStep === "idle" && (
          <button onClick={() => setPwStep("editing")} className="flex items-center gap-2 px-6 py-3 bg-white/[0.03] border border-white/10 rounded-xl text-sm font-bold uppercase tracking-wider text-white hover:bg-white/10 transition-all">
            <Key className="w-4 h-4" /> Change Password
          </button>
        )}

        <AnimatePresence>
          {pwStep === "editing" && (
            <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} onSubmit={handleChangePassword} className="space-y-5 overflow-hidden">
              <div>
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Current Password</label>
                <div className="relative">
                  <Key className="absolute w-4 h-4 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-emerald-500/50 focus:outline-none transition-all" placeholder="Enter current password" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-2">New Password</label>
                <div className="relative">
                  <Shield className="absolute w-4 h-4 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
                  <input type={showNewPw ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl pl-12 pr-12 py-3 text-sm text-white focus:border-emerald-500/50 focus:outline-none transition-all" placeholder="At least 6 characters" />
                  <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute -translate-y-1/2 right-4 top-1/2 text-neutral-500 hover:text-white">
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Confirm Password</label>
                <div className="relative">
                  <CheckCircle2 className="absolute w-4 h-4 -translate-y-1/2 left-4 top-1/2 text-neutral-500" />
                  <input type={showNewPw ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl pl-12 pr-12 py-3 text-sm text-white focus:border-emerald-500/50 focus:outline-none transition-all" placeholder="Re-enter new password" />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={pwChanging || !currentPassword || !newPassword || newPassword !== confirmPassword} className="flex items-center gap-2 px-6 py-3 text-xs font-bold tracking-wider uppercase transition-all border bg-emerald-500/10 border-emerald-500/20 rounded-xl text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40">
                  {pwChanging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Confirm Change
                </button>
                <button type="button" onClick={() => setPwStep("idle")} className="px-6 py-3 text-xs font-bold tracking-wider uppercase transition-all text-neutral-500 hover:text-white">
                  Cancel
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
