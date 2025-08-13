export default function Stat({ label, value, hint, icon }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-card rounded-2xl border border-soft">
      <div className="w-10 h-10 rounded-xl bg-primary/15 grid place-items-center text-lg text-primary">
        {icon || "📦"}
      </div>
      <div>
        <div className="text-xs text-ink/60">{label}</div>
        <div className="text-lg font-bold text-ink leading-tight">{value}</div>
        {hint && <div className="text-[11px] text-ink/60">{hint}</div>}
      </div>
    </div>
  );
}
