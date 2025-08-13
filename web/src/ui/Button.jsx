export function Button({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center px-4 py-2 rounded-xl font-semibold transition
      bg-primary text-white hover:brightness-110 active:brightness-95 disabled:opacity-50 focus:outline-none
      focus-visible:ring-2 focus-visible:ring-primary/40 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostBtn({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center px-3 py-2 rounded-xl text-sm transition
      bg-card text-ink border border-soft hover:bg-primary/10 active:bg-primary/15 disabled:opacity-50
      focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${className}`}
    >
      {children}
    </button>
  );
}
