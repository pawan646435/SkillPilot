// src/components/BackgroundGlow.jsx
export default function BackgroundGlow() {
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
      <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-emerald-500/5 blur-[120px]" />
      <div className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
      <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[60%] rounded-full bg-white/[0.02] blur-[100px]" />
    </div>
  );
}