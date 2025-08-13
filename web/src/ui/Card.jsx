export function Card({ className = "", children }) {
  return (
    <div className={`rounded-2xl bg-card text-ink shadow-sm border border-soft ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, right }) {
  return (
    <div className="p-5 border-b border-soft flex items-start gap-3">
      <div className="flex-1">
        {title && <div className="font-semibold text-ink">{title}</div>}
        {subtitle && <div className="text-sm text-ink/60 mt-0.5">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function CardBody({ className = "", children }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}
