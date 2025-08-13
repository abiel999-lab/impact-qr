// web/src/pages/ScanPage.jsx
import { useEffect, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Card, CardHeader, CardBody } from "../ui/Card";

function normalizeUrl(decoded) {
  if (!decoded) return null;
  if (decoded.startsWith("/")) return `${window.location.origin}${decoded}`;
  if (/^https?:\/\//i.test(decoded)) return decoded;
  try {
    new URL(decoded);
    return decoded;
  } catch {
    return null;
  }
}

export default function ScanPage() {
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const hasRedirected = useRef(false);
  const scannerRef = useRef(null);

  const startScanner = () => {
    setError("");
    const config = { fps: 10, qrbox: 240, rememberLastUsedCamera: true };
    const scanner = new Html5QrcodeScanner("qr-box", config, false);
    scanner.render(
      async (decodedText) => {
        if (hasRedirected.current) return;
        const url = normalizeUrl(decodedText);
        if (!url) {
          setInfo("Kode QR terbaca, tapi bukan tautan. Menampilkan teks.");
          alert(`QR: ${decodedText}`);
          return;
        }
        try {
          hasRedirected.current = true;
          await scanner.clear();
          window.location.href = url;
        } catch {
          window.location.href = url;
        }
      },
      (err) => {
        const s = String(err);
        if (s.includes("NotAllowedError")) setError("Akses kamera ditolak. Izinkan kamera lalu coba lagi.");
        else if (s.includes("NotFoundError")) setError("Tidak ada kamera terdeteksi.");
        else setError(s.slice(0, 120));
      }
    );
    scannerRef.current = scanner;
  };

  useEffect(() => {
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      setInfo("Tip: Kamera butuh HTTPS di perangkat nyata. Gunakan https://… saat produksi.");
    }
    startScanner();
    return () => {
      hasRedirected.current = false;
      if (scannerRef.current) scannerRef.current.clear().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRescan = async () => {
    hasRedirected.current = false;
    if (scannerRef.current) {
      try { await scannerRef.current.clear(); } catch {}
    }
    const box = document.getElementById("qr-box");
    if (box) box.innerHTML = "";
    startScanner();
  };

  return (
    <Card>
      <CardHeader title="Scan QR" subtitle="Izinkan akses kamera untuk memulai." />
      <CardBody>
        {/* Override style bawaan html5-qrcode agar ikut tema */}
        <style>{`
          #qr-box, #qr-box * { color: var(--ink) !important; }
          #qr-box a { color: var(--primary) !important; }
          #qr-box .html5-qrcode-element { color: var(--ink) !important; }
          #qr-box .qr-shaded-region,
          #qr-box .html5-qrcode-border-box { border-color: color-mix(in oklab, var(--ink) 20%, transparent) !important; }
          #qr-box .html5-qrcode-help { color: color-mix(in oklab, var(--ink) 60%, transparent) !important; }
          /* Ikon placeholder default berwarna hitam → invert pada dark mode */
          :root[data-theme="dark"] #qr-box img,
          :root[data-theme="dark"] #qr-box svg { filter: invert(1) brightness(1.2); }
        `}</style>

        {info && (
          <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-primary/10 text-ink/70">
            {info}
          </div>
        )}

        <div id="qr-box" className="overflow-hidden rounded-xl min-h-[260px] border border-soft" />

        {error && <p className="text-xs text-ink/60 mt-2">{error}</p>}

        <div className="mt-3">
          <button
            onClick={handleRescan}
            className="px-3 py-2 rounded-lg border border-soft bg-card hover:bg-primary/10 text-sm text-ink"
          >
            Rescan
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
