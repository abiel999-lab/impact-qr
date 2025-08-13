// web/src/pages/Dashboard.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Card, CardHeader, CardBody } from "../ui/Card";
import { Button, GhostBtn } from "../ui/Button";
import Stat from "../ui/Stat";
import QrBox from "../components/QrBox";
import LogoTile from "../components/LogoTile";

const API = (import.meta.env.VITE_API_BASE || "http://localhost:3001").replace(/\/$/, "");

/* ---------- helpers ---------- */
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
  return "📄";
}
function useInterval(callback, delay) {
  useEffect(() => {
    if (delay == null) return;
    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  }, [callback, delay]);
}
/* -------------------------------- */

async function tokenExists(API, id) {
  try {
    const { data } = await axios.get(`${API}/api/exists/${id}`);
    return !!data.ok;
  } catch {
    return false;
  }
}

export default function Dashboard() {
  // ⬇️ berubah: dukung banyak file
  const [files, setFiles] = useState([]);        // File[] yang dipilih
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(""); // id token / link yang baru di-copy

  // --- mini toast ---
  const [toasts, setToasts] = useState([]);
  const toast = (msg, type = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((s) => [...s, { id, msg, type }]);
    setTimeout(() => setToasts((s) => s.filter((t) => t.id !== id)), 2200);
  };

  // ⬇️ kontrol limit download (tetap ada)
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [limitValue, setLimitValue] = useState("5"); // "5" | "10" | "50" | "0"

  // stats realtime
  const [stats, setStats] = useState({ totalUploads: 0, totalDownloads: 0, avgSize: 0, activeLinks: 0 });
  const fetchStats = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/stats`);
      setStats(data);
    } catch {}
  }, []);
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useInterval(fetchStats, 5000);

  // recent (persist) + sinkron event dari History
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    const init = () => {
      const raw = localStorage.getItem("recentFiles");
      if (raw) {
        const parsed = JSON.parse(raw).map((r) => ({ expired: false, ...r }));
        setRecent(parsed);
      } else {
        setRecent([]);
      }
    };
    init();
    const onSync = () => init();
    window.addEventListener("recent-updated", onSync);
    return () => window.removeEventListener("recent-updated", onSync);
  }, []);
  const saveRecent = (list) => {
    setRecent(list);
    localStorage.setItem("recentFiles", JSON.stringify(list));
    window.dispatchEvent(new Event("recent-updated"));
  };

  // ----- drag & drop -----
  const [drag, setDrag] = useState(false);
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag(false);
    if (busy) return;
    const list = Array.from(e.dataTransfer.files || []);
    if (list.length) {
      setErr("");
      setFiles(list);
    }
  };

  // pilih file via input
  const onSelect = (fileList) => {
    setErr("");
    setFiles(Array.from(fileList || []));
  };

  // helper: ringkasan file terpilih
  const totalSize = useMemo(() => files.reduce((s,f)=>s+(f.size||0),0), [files]);

  const onUpload = async () => {
    if (files.length === 0) return;
    setBusy(true); setProgress(0); setErr("");

    // jika >1 file → /api/upload-multi (zip)
    const multiple = files.length > 1;
    const endpoint = multiple ? "/api/upload-multi" : "/api/upload";

    const fd = new FormData();
    if (multiple) {
      files.forEach((f) => fd.append("files", f));              // penting: "files" (plural)
    } else {
      fd.append("file", files[0]);
    }
    // limit (opsional)
    fd.append(
      "maxDownloads",
      limitEnabled && limitValue !== "0" ? String(Number(limitValue)) : ""
    );

    try {
      const { data } = await axios.post(`${API}${endpoint}`, fd, {
        onUploadProgress: (e) => e.total && setProgress(Math.round((e.loaded / e.total) * 100)),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const item = {
        id: data.token,
        name: data.filename || (multiple ? `Archive (${files.length} files).zip` : files[0].name),
        size: data.size ?? (multiple ? totalSize : files[0].size),
        ts: data.createdAt ?? Date.now(),
        url: data.url,
        expired: false,
        maxDownloads: data.maxDownloads ?? null,
      };

      setResult({
        link: `${API}${item.url}`,
        path: item.url,
        name: item.name,
        size: item.size,
        createdAt: item.ts,
      });

      // recent & history
      const next = [item, ...recent].slice(0, 5);
      saveRecent(next);
      const all = JSON.parse(localStorage.getItem("historyFiles") || "[]");
      localStorage.setItem("historyFiles", JSON.stringify([item, ...all]));

      // update stats (optimistic)
      setStats((s) => ({
        ...s,
        totalUploads: s.totalUploads + 1,
        activeLinks: s.activeLinks + 1,
        avgSize: Math.round((s.avgSize * s.totalUploads + item.size) / (s.totalUploads + 1)),
      }));

      toast("Upload berhasil ✅", "success");
    } catch (e) {
      setErr(e?.response?.data?.error || "Upload gagal. Coba lagi.");
      toast("Upload gagal", "error");
    } finally {
      setBusy(false);
    }
  };

  // klik item recent -> cek valid lalu tampilkan
  const showFromRecent = async (it) => {
    try {
      const { data } = await axios.get(`${API}/api/exists/${it.id}`);
      if (!data.ok) {
        // hapus dari recent
        const updatedRecent = recent.filter((r) => r.id !== it.id);
        saveRecent(updatedRecent);

        // hapus juga dari history
        const all = JSON.parse(localStorage.getItem("historyFiles") || "[]")
                      .filter((r) => r.id !== it.id);
        localStorage.setItem("historyFiles", JSON.stringify(all));

        setErr("Link sudah expired / sudah dibersihkan.");
        toast("Link expired — dihapus dari daftar", "error");
        return;
      }

    } catch {
      setErr("Gagal memeriksa status link.");
      return;
    }

    setResult({
      link: `${API}${it.url}`,
      path: it.url,
      name: it.name,
      size: it.size,
      createdAt: it.ts,
    });
    setFiles([]);
    setProgress(0);
    setErr("");
  };

  const removeRecent = (id) => {
    const n = recent.filter((x) => x.id !== id);
    saveRecent(n);
    if (copied === id) setCopied("");
  };

  const copyText = async (text, id = "") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id || text);
      toast("Link disalin 📋");
      setTimeout(() => setCopied(""), 1200);
    } catch {
      alert("Gagal menyalin.");
    }
  };

  const hasResult = useMemo(() => !!result, [result]);

  // hapus file dari daftar pilihan (sebelum upload)
  const removeChosen = (idx) => setFiles((list) => list.filter((_,i)=>i!==idx));

  const pruneLocalLists = useCallback(async () => {
    // ambil kedua list dari localStorage
    const rf = JSON.parse(localStorage.getItem("recentFiles") || "[]");
    const hf = JSON.parse(localStorage.getItem("historyFiles") || "[]");

    // cek semua id unik ke server
    const ids = [...new Set([...rf, ...hf].map(x => x.id))];
    const okPairs = await Promise.all(ids.map(async (id) => [id, await tokenExists(API, id)]));
    const okMap = new Map(okPairs);

    // filter yang masih valid
    const rfNext = rf.filter(x => okMap.get(x.id));
    const hfNext = hf.filter(x => okMap.get(x.id));

    // simpan balik & sync UI
    localStorage.setItem("recentFiles", JSON.stringify(rfNext));
    localStorage.setItem("historyFiles", JSON.stringify(hfNext));
    setRecent(rfNext);
    window.dispatchEvent(new Event("recent-updated"));
  }, []);

  // masih di dalam Dashboard(), tambahkan efek berikut:
  useEffect(() => { pruneLocalLists(); }, [pruneLocalLists]);

  useEffect(() => {
    const onFocus = () => pruneLocalLists();
    const onVisible = () => document.visibilityState === "visible" && pruneLocalLists();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pruneLocalLists]);


  return (
    <div className="grid gap-6">
      {/* Toasts */}
      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-3 py-2 rounded-lg text-sm shadow bg-[var(--card)] ring-1 ring-black/10 ${
              t.type === "error" ? "text-red-600" : t.type === "success" ? "text-green-700" : "text-ink"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      <Card>
        <CardBody className="flex flex-col sm:flex-row items-center gap-5">
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-ink">Upload file → share via QR</h1>
            <p className="text-sm text-ink/70 mt-1">
              Impact QR adalah alat sederhana untuk memindahkan file dari komputer ke HP (atau ke orang lain) dalam
              hitungan detik. Upload → dapat link &amp; QR → scan di HP → file langsung terunduh. Tanpa akun,
              mobile-first.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">Transfer PC → HP</span>
              <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">Share link + QR</span>
              <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">Tanpa akun</span>
            </div>
          </div>
          <LogoTile />
        </CardBody>
      </Card>

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total Upload" value={stats.totalUploads.toLocaleString()} hint="bulan ini" icon="⬆️" />
        <Stat label="Total Download" value={stats.totalDownloads.toLocaleString()} hint="bulan ini" icon="⬇️" />
        <Stat label="Avg. Size" value={formatBytes(stats.avgSize)} hint="rata-rata" icon="📏" />
        <Stat label="Active Links" value={stats.activeLinks.toLocaleString()} hint="tidak expired" icon="🔗" />
      </div>

      {/* items-start supaya kolom kiri tidak memanjang mengikuti tinggi Recent */}
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Upload */}
        <Card className="lg:col-span-2">
          <CardHeader title="Upload & Get QR" subtitle="Seret file ke area di bawah atau pilih manual." />
          <CardBody>
            {/* ⬇️ Kontrol limit download */}
            <div className="flex items-center gap-3 mb-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-[var(--primary)]"
                  checked={limitEnabled}
                  onChange={(e) => setLimitEnabled(e.target.checked)}
                />
                Batasi jumlah download
              </label>
              <select
                className="px-2 py-1 rounded-lg border border-black/10 bg-[var(--card)] text-ink disabled:opacity-50"
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value)}
                disabled={!limitEnabled}
              >
                <option value="5">5x</option>
                <option value="10">10x</option>
                <option value="50">50x</option>
                <option value="0">No limit</option>
              </select>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className={`rounded-xl border-2 border-dashed p-4 cursor-pointer select-none
                ${drag ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-black/10 hover:bg-black/5"}`}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <div className="text-sm text-ink">
                <b>Drag & drop</b> file (boleh banyak) di sini, atau{" "}
                <span className="text-primary underline">klik untuk memilih</span>.
              </div>
            </div>

            {/* Input asli */}
            <div className="flex flex-col sm:flex-row gap-3 items-center mt-3">
              <input
                id="file-input"
                type="file"
                multiple
                className="block w-full text-sm file:mr-3 file:bg-primary file:text-white file:px-3 file:py-2 file:rounded-lg file:border-none disabled:opacity-50"
                disabled={busy}
                onChange={(e) => onSelect(e.target.files)}
              />
              <Button onClick={onUpload} disabled={files.length === 0 || busy}>
                {busy ? `Uploading ${progress}%` : files.length > 1 ? `Upload ${files.length} files` : "Upload"}
              </Button>
              {(files.length > 0 || result) && (
                <GhostBtn onClick={() => { setFiles([]); setResult(null); setErr(""); }}>
                  Reset
                </GhostBtn>
              )}
            </div>

            {/* Preview pilihan */}
            {files.length > 0 && !busy && (
              <div className="mt-2 text-sm text-ink/70 space-y-1">
                <div>{files.length > 1 ? `${files.length} files` : files[0].name} • {formatBytes(totalSize)}</div>
                {files.length > 1 && (
                  <ul className="text-xs text-ink/60 space-y-1">
                    {files.slice(0,5).map((f,idx)=>(
                      <li key={idx} className="flex items-center gap-2">
                        <span>{fileIcon(f.name)}</span>
                        <span className="truncate">{f.name}</span>
                        <span className="opacity-70">• {formatBytes(f.size)}</span>
                        <button
                          className="ml-auto underline hover:opacity-80"
                          onClick={()=>removeChosen(idx)}
                          title="Hapus dari daftar"
                        >
                          remove
                        </button>
                      </li>
                    ))}
                    {files.length > 5 && <li>… dan {files.length-5} lainnya</li>}
                  </ul>
                )}
              </div>
            )}

            {/* progress */}
            {busy && (
              <div className="w-full h-2 bg-black/5 rounded-full mt-3" aria-label="progress">
                <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${progress}%` }} />
              </div>
            )}

            {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
          </CardBody>
        </Card>

        {/* Recent files */}
        <Card>
          <CardHeader
            title="Recent files"
            right={<GhostBtn onClick={() => { localStorage.removeItem("recentFiles"); saveRecent([]); }}>Clear</GhostBtn>}
          />
          <CardBody className="p-0">
            <ul className="divide-y divide-black/5">
              {recent.length === 0 && <li className="px-5 py-6 text-sm text-ink/60">Belum ada riwayat.</li>}
              {recent.map((it) => {
                const disabled = !!it.expired;
                const link = `${API}${it.url}`;
                return (
                  <li key={it.id} className="py-3 flex items-center gap-3">
                    <button
                      className={`w-8 h-8 rounded-lg grid place-items-center ${disabled ? "bg-black/5 text-ink/40" : "bg-primary/15"}`}
                      onClick={() => !disabled && showFromRecent(it)}
                      title={disabled ? "Expired" : "Tampilkan QR"}
                      disabled={disabled}
                    >
                      {fileIcon(it.name)}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm truncate ${disabled ? "text-ink/40" : "text-ink"}`}>{it.name}</div>
                      <div className={`text-[11px] ${disabled ? "text-ink/30" : "text-ink/60"}`}>
                        {formatBytes(it.size)} • {timeAgo(it.ts)} {disabled && "• expired"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <GhostBtn disabled={disabled} onClick={() => showFromRecent(it)}>Show QR</GhostBtn>
                      <GhostBtn disabled={disabled} onClick={() => copyText(link, it.id)}>
                        {copied === it.id ? "Copied!" : "Copy"}
                      </GhostBtn>
                      <GhostBtn onClick={() => removeRecent(it.id)}>Hapus</GhostBtn>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* Share panel */}
      {result && (
        <Card>
          <CardHeader title="Share via QR" subtitle="Scan dengan kamera HP untuk unduh otomatis." />
          <CardBody className="grid sm:grid-cols-[240px_1fr] gap-6">
            <div className="mx-auto">
              <QrBox url={`${API}${result.path}`} size={220} />
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-ink/60">Link unduhan</div>
                <a className="text-ink break-all underline" href={`${API}${result.path}`} target="_blank" rel="noreferrer">
                  {result.link}
                </a>
              </div>
              <div className="flex gap-2">
                <GhostBtn onClick={() => window.open(`${API}${result.path}`, "_blank")}>Buka</GhostBtn>
                <GhostBtn onClick={() => copyText(result.link)}>
                  {copied === result.link ? "Copied!" : "Copy Link"}
                </GhostBtn>
              </div>
              <p className="text-xs text-ink/60">
                Nama file: <b>{result.name}</b> • {formatBytes(result.size)}
              </p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
