// web/src/ui/Header.jsx
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(
    (localStorage.getItem("theme") || "light") === "dark"
  );

  const menuRef = useRef(null);
  const btnRef = useRef(null);

  // Tutup menu saat rute berubah
  useEffect(() => { setOpen(false); }, [pathname]);

  // Tutup saat klik di luar
  useEffect(() => {
    const onDocClick = (e) => {
      if (!open) return;
      const t = e.target;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Tutup saat Esc
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Pantau perubahan tema dari ThemeToggle (ubah data-theme)
  useEffect(() => {
    const getDark = () => document.documentElement.dataset.theme === "dark";
    setDark(getDark());
    const obs = new MutationObserver(() => setDark(getDark()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const Tab = ({ to, children, className = "" }) => (
    <Link
      to={to}
      className={`px-3 sm:px-4 py-2 rounded-xl text-[13px] sm:text-sm font-medium transition whitespace-nowrap
        ${pathname === to ? "bg-primary text-white shadow" : "bg-card text-ink hover:bg-primary/10"} ${className}`}
    >
      {children}
    </Link>
  );

  // Kelas untuk item di menu hamburger (override agar pakai warna kontras per tema)
  const mobileItemClass = `w-full text-center bg-transparent ${
    dark ? "text-white hover:bg-white/10" : "text-black hover:bg-black/5"
  }`;

  return (
    <header className="sticky top-0 z-20 w-full backdrop-blur bg-card/80 border-b border-soft">
      <div className="mx-auto max-w-6xl w-full h-14 px-3 sm:px-4 flex items-center gap-3 relative">
        {/* Brand */}
        <div className="font-bold tracking-tight text-ink shrink-0">Impact QR</div>

        {/* Nav desktop */}
        <nav aria-label="Primary" className="ml-auto hidden md:block">
          <ul className="flex items-center gap-2">
            <li><Tab to="/">Dashboard</Tab></li>
            <li><Tab to="/scan">Scan</Tab></li>
            <li><Tab to="/history">History</Tab></li>
            <li className="ml-2"><ThemeToggle /></li>
          </ul>
        </nav>

        {/* Kanan (mobile): Theme toggle + Hamburger */}
        <div className="ml-auto flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            ref={btnRef}
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen((s) => !s)}
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-card text-ink ring-1 ring-soft hover:bg-primary/10"
          >
            {/* icon hamburger */}
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z" />
            </svg>
          </button>
        </div>

        {/* Dropdown mobile */}
        {open && (
          <div ref={menuRef} className="absolute right-3 left-3 top-14 md:hidden">
            <div
              className={`rounded-2xl shadow-xl ring-1 p-2 ${
                dark ? "bg-black text-white ring-white/10" : "bg-white text-black ring-black/10"
              }`}
            >
              <div className="grid gap-2">
                {/* <<< PENTING: kini ada children, jadi teksnya muncul >>> */}
                <Tab to="/" className={mobileItemClass}>Dashboard</Tab>
                <Tab to="/scan" className={mobileItemClass}>Scan</Tab>
                <Tab to="/history" className={mobileItemClass}>History</Tab>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
