// server/index.js (atau server.js)
// Core download via token + per-link download limit
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// === Storage lokal untuk DEV ===
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer (dev). Untuk produksi pakai S3/R2 multipart.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

// In-memory index: token -> { path, filename, size, createdAt, downloads, maxDownloads, expired }
const files = new Map();

// Stats global sederhana
let totalUploads = 0;
let totalDownloads = 0;
let totalBytesUploaded = 0;

// Upload (bisa kirim maxDownloads via multipart field)
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No file' });

  // Ambil limit dari form-data (boleh kosong/null utk unlimited)
  let maxDownloads = null;
  if (req.body && req.body.maxDownloads != null && req.body.maxDownloads !== '') {
    const n = Number(req.body.maxDownloads);
    if (Number.isFinite(n) && n > 0) maxDownloads = n;
  }

  const token = uuid().slice(0, 8);
  const rec = {
    path: req.file.path,
    filename: req.file.originalname,
    size: req.file.size,
    createdAt: Date.now(),
    downloads: 0,
    maxDownloads,    // null = unlimited
    expired: false,
  };
  files.set(token, rec);

  totalUploads += 1;
  totalBytesUploaded += rec.size;

  res.json({
    ok: true,
    token,
    filename: rec.filename,
    size: rec.size,
    createdAt: rec.createdAt,
    url: `/d/${token}`,
    maxDownloads: rec.maxDownloads,
  });
});

// Download publik (cek limit SEBELUM mengirim file)
// server/index.js (potongan penting saja)
app.get('/d/:token', (req, res) => {
  const token = req.params.token;
  const rec = files.get(token);
  if (!rec) return res.status(404).type('html').send(renderNotFoundPage());

  const hitLimit = rec.maxDownloads != null && rec.downloads >= rec.maxDownloads;
  if (rec.expired || hitLimit) {
    rec.expired = true;
    return res.status(410).type('html').send(renderExpiredPage({
      token,
      downloads: rec.downloads,
      maxDownloads: rec.maxDownloads,
      filename: rec.filename
    }));
  }

  rec.downloads += 1;
  totalDownloads += 1;

  res.download(rec.path, rec.filename, (err) => {
    if (err) rec.downloads = Math.max(0, rec.downloads - 1);
    if (rec.maxDownloads != null && rec.downloads >= rec.maxDownloads) rec.expired = true;
  });
});

// ——— Helpers UI sederhana (inline CSS, dark-mode friendly)
function renderExpiredPage({ token, downloads, maxDownloads, filename }) {
  const reason = maxDownloads == null
    ? 'Tautan ini sudah tidak tersedia.'
    : `Batas unduhan terpenuhi (${downloads}/${maxDownloads}).`;

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Link expired • Impact QR</title>
<style>
  :root{
    --bg:#0f1016; --card:#151622; --ink:#e8e8ef; --muted:#a6a7b8; --primary:#ac94d8;
    --soft:rgba(255,255,255,.06);
  }
  @media (prefers-color-scheme: light){
    :root{ --bg:#f7f7fb; --card:#ffffff; --ink:#1a1528; --muted:#6b6a76; --soft:rgba(0,0,0,.06) }
  }
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,Segoe UI,Roboto,Helvetica,Arial}
  .wrap{min-height:100vh;display:grid;place-items:center;padding:32px}
  .card{width:min(720px,92vw);background:var(--card);border:1px solid var(--soft);border-radius:20px;padding:28px 24px;box-shadow:0 8px 30px rgba(0,0,0,.15)}
  h1{margin:0 0 6px;font-size:22px}
  p{margin:6px 0 0;color:var(--muted)}
  .row{display:flex;gap:16px;align-items:center;margin:12px 0 16px}
  .icon{width:56px;height:56px;border-radius:14px;background:rgba(172,148,216,.15);display:grid;place-items:center;font-size:28px}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .chip{font-size:12px;padding:6px 10px;border-radius:999px;background:var(--soft);color:var(--muted);border:1px solid var(--soft)}
  .actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
  .btn{padding:10px 14px;border-radius:12px;border:1px solid var(--soft);background:#fff0;color:#fff}
  .btn.primary{background:var(--primary);border-color:var(--primary);color:#fff}
  .btn.ghost{background:var(--card);color:var(--ink)}
  .mono{font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
  a{color:inherit;text-decoration:none}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="row">
        <div class="icon">🔒</div>
        <div>
          <h1>Link expired</h1>
          <p>${reason}</p>
          <div class="chips">
            <div class="chip mono">Token: ${token}</div>
            ${filename ? `<div class="chip">${filename}</div>` : ''}
            ${maxDownloads != null ? `<div class="chip">${downloads}/${maxDownloads} downloads</div>` : ''}
          </div>
          <div class="actions">
          </div>
        </div>
      </div>
    </div>
  </div>
</body></html>`;
}

function renderNotFoundPage(){
  return `<!doctype html><meta charset="utf-8"><title>Tidak ditemukan</title>
  <style>body{margin:0;display:grid;place-items:center;min-height:100vh;font:16px system-ui;background:#0f1016;color:#e8e8ef}
  .c{padding:28px;border:1px solid rgba(255,255,255,.06);border-radius:16px;background:#151622}</style>
  <div class="c"><h2>404 • Tautan tidak ditemukan</h2><p>Periksa kembali URL atau unggah file baru.</p><p><a href="/">← Dashboard</a></p></div>`;
}


// Apakah token masih bisa dipakai? (false kalau tidak ada atau expired)
app.get('/api/exists/:token', (req, res) => {
  const rec = files.get(req.params.token);
  const ok = !!rec && !rec.expired && !(rec.maxDownloads != null && rec.downloads >= rec.maxDownloads);
  res.json({ ok });
});

// Stats realtime (activeLinks = yang belum expired)
app.get('/api/stats', (req, res) => {
  let activeLinks = 0;
  for (const rec of files.values()) {
    const available = !rec.expired && !(rec.maxDownloads != null && rec.downloads >= rec.maxDownloads);
    if (available) activeLinks += 1;
  }
  const avgSize = totalUploads ? Math.round(totalBytesUploaded / totalUploads) : 0;
  res.json({ totalUploads, totalDownloads, avgSize, activeLinks });
});

// (Optional) info sederhana utk debug
app.get('/api/file/:token', (req, res) => {
  const rec = files.get(req.params.token);
  if (!rec) return res.status(404).json({ ok: false });
  res.json({ ok: true, token: req.params.token, ...rec });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));

// Nonaktifkan timeout (dev only, agar upload besar tidak terputus)
server.headersTimeout = 0;
server.requestTimeout = 0;

// === Multi-file → zip satu link
const Archiver = require('archiver');

app.post('/api/upload-multi', upload.array('files', 50), async (req, res) => {
  const filesIn = req.files || [];
  if (!filesIn.length) return res.status(400).json({ ok:false, error:'No files' });

  // ambil limit opsional
  let maxDownloads = null;
  const raw = req.body?.maxDownloads;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) maxDownloads = n;
  }

  const token = uuid().slice(0,8);
  const zipPath = path.join(UPLOAD_DIR, `${Date.now()}-${token}.zip`);
  const out = fs.createWriteStream(zipPath);
  const archive = Archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (err) => res.status(500).json({ ok:false, error:String(err) }));
  archive.pipe(out);

  for (const f of filesIn) {
    // masukkan file dengan nama aslinya
    archive.file(f.path, { name: f.originalname });
  }
  await archive.finalize();

  out.on('close', () => {
    // hapus file asli hasil multer biar hemat storage dev
    filesIn.forEach(f => fs.existsSync(f.path) && fs.unlinkSync(f.path));

    const rec = {
      path: zipPath,
      filename: `impactqr-${token}.zip`,
      size: fs.statSync(zipPath).size,
      createdAt: Date.now(),
      downloads: 0,
      maxDownloads,
      expired: false,
    };
    files.set(token, rec);

    totalUploads += 1;
    totalBytesUploaded += rec.size;

    res.json({
      ok: true,
      token,
      filename: rec.filename,
      size: rec.size,
      createdAt: rec.createdAt,
      url: `/d/${token}`,
      maxDownloads: rec.maxDownloads
    });
  });
});

