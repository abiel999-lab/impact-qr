import { useState } from 'react';
import axios from 'axios';
import QrBox from '../components/QrBox';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);

  const onUpload = async () => {
    if (!file) return;
    setBusy(true); setProgress(0);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await axios.post(`${API}/api/upload`, fd, {
        onUploadProgress: e => e.total && setProgress(Math.round((e.loaded/e.total)*100))
      });
      setResult({
        link: `${window.location.origin}${data.url}`,
        path: data.url,
        name: data.filename
      });
    } catch (e) {
      alert('Upload gagal'); console.error(e);
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-6">
      {/* uploader card */}
      <div className="card p-5">
        <h2 className="text-lg font-semibold text-ink mb-3">Upload & Get QR</h2>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-center">
          <label className="block">
            <input
              type="file"
              className="block w-full text-sm file:mr-3 file:btn-ghost file:rounded-lg file:px-3 file:py-2 file:border file:border-black/5"
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
            {file && <div className="text-xs text-ink/60 mt-1">{file.name}</div>}
          </label>
          <button onClick={onUpload} disabled={!file || busy} className="btn-primary">
            {busy ? `Uploading ${progress}%` : 'Upload'}
          </button>
        </div>

        {busy && (
          <div className="w-full h-2 bg-black/5 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* result card */}
      {result && (
        <div className="card p-5 grid sm:grid-cols-[240px_1fr] gap-5">
          <div className="mx-auto">
            <QrBox url={`${window.location.origin}${result.path}`} size={220} />
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-ink/60">Link unduhan</div>
              <a className="text-ink break-all underline" href={result.path} target="_blank">
                {result.link}
              </a>
            </div>
            <div className="flex gap-2">
              <a className="btn-ghost" href={result.path} target="_blank" rel="noreferrer">Buka</a>
              <button
                className="btn-ghost"
                onClick={() => navigator.clipboard.writeText(result.link)}
              >
                Copy Link
              </button>
            </div>
            <p className="text-xs text-ink/60">
              Scan QR di HP untuk download otomatis. Nama file: <b>{result.name || 'file'}</b>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
