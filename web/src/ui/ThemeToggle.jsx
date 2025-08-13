// web/src/ui/ThemeToggle.jsx
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    const isDark = saved === "dark";
    setDark(isDark);
    document.documentElement.dataset.theme = isDark ? "dark" : "";
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "";
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <button
      onClick={toggle}
      aria-pressed={dark}
      title={dark ? "Switch to Light" : "Switch to Dark"}
      className="px-3 py-2 rounded-xl bg-card text-ink border border-soft
                 hover:bg-primary/10 active:bg-primary/15 transition text-sm"
    >
      {dark ? "🌙 Dark" : "☀️ Light"}
    </button>
  );
}
