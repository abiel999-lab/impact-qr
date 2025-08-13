import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardBody } from "../ui/Card";
import QrBox from "../components/QrBox";
import { GhostBtn } from "../ui/Button";

const API = (import.meta.env.VITE_API_BASE || "http://localhost:3001").replace(/\/$/, "");

async function tokenExists(API, id) {
  try {
    const { data } = await fetch(`${API}/api/exists/${id}`).then(r => r.json());
    return !!data.ok;
  } catch {
    return false;
  }
}


/* helpers */
function formatBytes(bytes = 0, decimals = 1) {
  if (!+bytes) return "0 B";
  const k = 1024, dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}
function fileIcon(name = "") {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["png","jpg","jpeg","webp","gif","bmp","svg"].includes(ext)) return "🖼️";
  if (["mp4","mov","avi","mkv","webm"].includes(ext)) return "🎬";
  if (["pdf"].includes(ext)) return "📕";
  if (["zip","rar","7z","gz"].includes(ext)) return "🗜️";
  if (["mp3","wav","flac","m4a","aac"].includes(ext)) return "🎵";
  if (["doc","docx"].includes(ext)) return "📝";
  if (["xls","xlsx","csv"].includes(ext)) return "📊";
  if (["ppt","pptx"].includes(ext)) return "📽️";
  return "📄";
}

export default function History() {
  const [items, setItems] = useState([]);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("historyFiles");
    setItems(raw ? JSON.parse(raw) : []);
  }, []);

  const saveHistory = (list) => {
    setItems(list);
    localStorage.setItem("historyFiles", JSON.stringify(list));
  };

  // Sinkron Recent util
  const syncRecent = (mutator) => {
    const raw = localStorage.getItem("recentFiles") || "[]";
    const rec = JSON.parse(raw);
    const next = mutator(rec);
    localStorage.setItem("recentFiles", JSON.stringify(next));
    window.dispatchEvent(new Event("recent-updated"));
  };

  const clearAll = () => {
    saveHistory([]);
    localStorage.removeItem("historyFiles");
    localStorage.removeItem("recentFiles");
    window.dispatchEvent(new Event("recent-updated"));
    setResult(null);
  };

  const removeOne = (id) => {
    const next = items.filter(x => x.id !== id);
    saveHistory(next);
    syncRecent(rec => rec.filter(r => r.id !== id));
    if (result?.id === id) setResult(null);
  };

  // === Lock / Unlock ===
  const lockItem = async (it) => {
    const pw = window.prompt(`Buat password untuk "${it.name}"`);
    if (pw == null || pw.trim().length === 0) return;
    try {
      await fetch(`${API}/api/lock/${it.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw.trim() })
      });
      const next = items.map(x => x.id === it.id ? { ...x, locked: true } : x);
      saveHistory(next);
      syncRecent(rec => rec.map(r => r.id === it.id ? { ...r, locked: true } : r));
      alert("Link dikunci.");
    } catch {
      alert("Gagal mengunci link.");
    }
  };

  // Wajib input password untuk unlock
  const unlockItem = async (it) => {
    const pw = window.prompt(`Masukkan password untuk unlock "${it.name}"`);
    if (pw == null || pw.trim() === "") return;

    try {
      // Prefer: DELETE /api/lock/:id { password }
      let res = await fetch(`${API}/api/lock/${it.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw.trim() })
      });

      // Fallback server lama
      if (!res.ok) {
        res = await fetch(`${API}/api/lock/${it.id}?unlock=1`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-password": pw.trim() },
          body: JSON.stringify({ password: "" })
        });
      }

      if (!res.ok) throw new Error("Password salah atau gagal unlock.");

      const next = items.map(x => x.id === it.id ? { ...x, locked: false } : x);
      saveHistory(next);
      syncRecent(rec => rec.map(r => r.id === it.id ? { ...r, locked: false } : r));
      alert("Password dihapus (unlock sukses).");
    } catch (e) {
      alert(e.message || "Password salah atau gagal unlock.");
    }
  };

  const showQR = async (it) => {
    if (!(await tokenExists(API, it.id))) {
      // auto-hapus item invalid
      const next = items.filter(x => x.id !== it.id);
      saveHistory(next);
      syncRecent((rec) => rec.filter(r => r.id !== it.id));
      alert("Link sudah tidak berlaku dan dihapus dari daftar.");
      return;
    }
    setResult({
      id: it.id,
      link: `${API}${it.url}`,
      path: it.url,
      name: it.name,
      size: it.size,
      createdAt: it.ts,
    });
  };


  const copyText = async (t, id) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(id);
      setTimeout(() => setCopied(""), 1200);
    } catch {
      alert("Gagal menyalin.");
    }
  };

  const hasResult = useMemo(() => !!result, [result]);

  const pruneHistory = async () => {
    if (!items.length) return;
    const okPairs = await Promise.all(items.map(async (it) => [it.id, await tokenExists(API, it.id)]));
    const okMap = new Map(okPairs);
    const next = items.filter(it => okMap.get(it.id));
    if (next.length !== items.length) {
      setItems(next);
      localStorage.setItem("historyFiles", JSON.stringify(next));

      // sinkronkan Recent juga
      const rec = JSON.parse(localStorage.getItem("recentFiles") || "[]")
                    .filter(r => okMap.get(r.id));
      localStorage.setItem("recentFiles", JSON.stringify(rec));
      window.dispatchEvent(new Event("recent-updated"));
    }
  };

  // jalankan saat halaman dibuka & saat kembali fokus
  useEffect(() => { pruneHistory(); }, []); // on mount
  useEffect(() => {
    const onFocus = () => pruneHistory();
    const onVisible = () => document.visibilityState === "visible" && pruneHistory();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [items]);


  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="History"
          subtitle="Semua link yang pernah dibuat. Item expired tetap ada, tombol dinonaktifkan."
          right={<GhostBtn onClick={clearAll}>Clear All</GhostBtn>}
        />
        <CardBody className="p-0">
          <ul className="divide-soft">
            {items.length === 0 && (
              <li className="px-5 py-6 text-sm text-ink/60">Belum ada riwayat.</li>
            )}

            {items.map((it) => {
              const link = `${API}${it.url}`;
              const disabled = !!it.expired;

              return (
                <li key={it.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Kiri: ikon + nama + info — biar rapi di mobile */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div className={`w-9 h-9 rounded-xl grid place-items-center flex-shrink-0 ${disabled ? "bg-soft text-ink/40" : "bg-primary/15 text-primary"}`}>
                      {it.locked ? "🔒" : fileIcon(it.name)}
                    </div>
                    <div className="min-w-0">
                      <div className={`truncate text-sm ${disabled ? "text-ink/40" : "text-ink"}`}>{it.name}</div>
                      <div className={`text-[11px] ${disabled ? "text-ink/30" : "text-ink/60"}`}>
                        {formatBytes(it.size)} • {timeAgo(it.ts)} {disabled && "• expired"}
                      </div>
                    </div>
                  </div>

                  {/* Kanan: tombol — wrap jika sempit */}
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <GhostBtn disabled={disabled} onClick={() => showQR(it)}>Show QR</GhostBtn>
                    <GhostBtn disabled={disabled} onClick={() => window.open(link, "_blank")}>Buka</GhostBtn>
                    <GhostBtn disabled={disabled} onClick={() => copyText(link, it.id)}>
                      {copied === it.id ? "Copied!" : "Copy"}
                    </GhostBtn>
                    {it.locked
                      ? <GhostBtn onClick={() => unlockItem(it)}>Unlock</GhostBtn>
                      : <GhostBtn onClick={() => lockItem(it)}>Lock</GhostBtn>}
                    <GhostBtn onClick={() => removeOne(it.id)}>Hapus</GhostBtn>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {hasResult && (
        <Card>
          <CardHeader title="Share via QR" subtitle="Scan QR di HP untuk mengunduh otomatis." />
          <CardBody className="grid sm:grid-cols-[240px_1fr] gap-6">
            <div className="mx-auto"><QrBox url={result.link} size={220} /></div>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-ink/60">Link unduhan</div>
                <a className="underline break-all text-ink" href={result.link} target="_blank" rel="noreferrer">
                  {result.link}
                </a>
              </div>
              <div className="text-xs text-ink/60">
                Nama file: <b>{result.name}</b> • {formatBytes(result.size)}
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
