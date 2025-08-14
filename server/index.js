// In-memory Impact QR API (no disk writes)
// -------------------------------------------------
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const Archiver = require('archiver');
const { PassThrough } = require('stream');

const app = express();
app.use(express.json());

// --- limits & TTL ---
const MB = 1024 * 1024;
const MAX_FILE_MB   = Number(process.env.MAX_FILE_MB   || 25);   // per file
const MAX_TOTAL_MB  = Number(process.env.MAX_TOTAL_MB  || 50);   // total (multi)
const MAX_FILES     = Number(process.env.MAX_FILES     || 10);   // jumlah file (multi)
const LINK_TTL_MIN  = Number(process.env.LINK_TTL_MIN  || 60);   // menit (default 1 jam)
const PRUNE_INTERVAL_SEC = Number(process.env.PRUNE_INTERVAL_SEC || 60);

const MAX_FILE_BYTES  = MAX_FILE_MB  * MB;
const MAX_TOTAL_BYTES = MAX_TOTAL_MB * MB;

// ===== CORS =====
const allowed = (process.env.FRONTEND_ORIGIN || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow curl/Postman
      if (allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
  })
);

// vary header untuk cache yang benar
app.use((req, res, next) => {
  if (allowed.length) res.setHeader('Vary', 'Origin');
  next();
});

// ===== Multer: memory only + limits =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: MAX_FILES
  }
});

// ===== In-memory store =====
// token -> { buffer, filename, size, createdAt, expiresAt, downloads, maxDownloads, expired, locked, password }
const files = new Map();

// Stats sederhana
let totalUploads = 0;
let totalDownloads = 0;
let totalBytesUploaded = 0;

// Helper: zip beberapa file (Buffer) → Buffer ZIP
function zipFilesToBuffer(fileList /* [{buffer, originalname}] */) {
  return new Promise((resolve, reject) => {
    const archive = Archiver('zip', { zlib: { level: 9 } });
    const out = new PassThrough();
    const chunks = [];

    out.on('data', (c) => chunks.push(c));
    out.on('finish', () => resolve(Buffer.concat(chunks)));
    out.on('error', reject);
    archive.on('error', reject);

    archive.pipe(out);
    for (const f of fileList) {
      archive.append(f.buffer, { name: f.originalname });
    }
    archive.finalize().catch(reject);
  });
}

// ========== ROUTES ==========

// Health/info
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'Impact QR API (in-memory)' });
});

// Keep-alive ping (opsional)
app.get('/__ping', (req, res) => res.json({ ok: true }));

// Upload single
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No file' });

  let maxDownloads = null;
  if (req.body?.maxDownloads !== undefined && req.body.maxDownloads !== '') {
    const n = Number(req.body.maxDownloads);
    if (Number.isFinite(n) && n > 0) maxDownloads = n;
  }

  const token = uuid().slice(0, 8);
  const now = Date.now();
  const rec = {
    buffer: req.file.buffer,
    filename: req.file.originalname,
    size: req.file.size,
    createdAt: now,
    expiresAt: now + LINK_TTL_MIN * 60 * 1000,
    downloads: 0,
    maxDownloads, // null = unlimited
    expired: false,
    locked: false,
    password: '',
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

// Upload multi → ZIP (in-memory)
app.post('/api/upload-multi', upload.array('files', MAX_FILES), async (req, res) => {
  const list = req.files || [];
  if (!list.length) return res.status(400).json({ ok: false, error: 'No files' });

  // validasi total size
  const totalBytes = list.reduce((s,f)=> s + (f.size || 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return res.status(413).json({
      ok: false,
      error: `Total ukuran file melebihi ${MAX_TOTAL_MB} MB (saat ini ${(totalBytes/MB).toFixed(1)} MB).`
    });
  }

  let maxDownloads = null;
  if (req.body?.maxDownloads !== undefined && req.body.maxDownloads !== '') {
    const n = Number(req.body.maxDownloads);
    if (Number.isFinite(n) && n > 0) maxDownloads = n;
  }

  try {
    const zipBuffer = await zipFilesToBuffer(
      list.map((f) => ({ buffer: f.buffer, originalname: f.originalname }))
    );

    const token = uuid().slice(0, 8);
    const now = Date.now();
    const rec = {
      buffer: zipBuffer,
      filename: `impactqr-${token}.zip`,
      size: zipBuffer.length,
      createdAt: now,
      expiresAt: now + LINK_TTL_MIN * 60 * 1000,
      downloads: 0,
      maxDownloads,
      expired: false,
      locked: false,
      password: '',
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
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Download (honor TTL, limit & lock)
app.get('/d/:token', (req, res) => {
  const token = req.params.token;
  const rec = files.get(token);
  if (!rec) return res.status(404).type('html').send(renderNotFoundPage());

  // TTL
  const now = Date.now();
  if (rec.expiresAt && now > rec.expiresAt) rec.expired = true;

  // Locked?
  if (rec.locked) {
    return res.status(401).type('html').send(renderLockedPage({ token, filename: rec.filename }));
  }

  const hitLimit = rec.maxDownloads != null && rec.downloads >= rec.maxDownloads;
  if (rec.expired || hitLimit) {
    rec.expired = true;
    return res
      .status(410)
      .type('html')
      .send(
        renderExpiredPage({
          token,
          downloads: rec.downloads,
          maxDownloads: rec.maxDownloads,
          filename: rec.filename,
        })
      );
  }

  rec.downloads += 1;
  totalDownloads += 1;
  if (rec.maxDownloads != null && rec.downloads >= rec.maxDownloads) rec.expired = true;

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitize(rec.filename)}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(rec.buffer);
});

// Exists?
app.get('/api/exists/:token', (req, res) => {
  const rec = files.get(req.params.token);
  if (!rec) return res.json({ ok: false });

  if (rec.expiresAt && Date.now() > rec.expiresAt) rec.expired = true;
  const ok = !rec.locked && !rec.expired &&
    !(rec.maxDownloads != null && rec.downloads >= rec.maxDownloads);

  res.json({ ok });
});

// Simple stats
app.get('/api/stats', (req, res) => {
  let activeLinks = 0;
  const now = Date.now();
  for (const rec of files.values()) {
    const expiredByTtl = rec.expiresAt && now > rec.expiresAt;
    const available =
      !rec.locked &&
      !rec.expired &&
      !expiredByTtl &&
      !(rec.maxDownloads != null && rec.downloads >= rec.maxDownloads);
    if (available) activeLinks += 1;
  }
  const avgSize = totalUploads ? Math.round(totalBytesUploaded / totalUploads) : 0;
  res.json({ totalUploads, totalDownloads, avgSize, activeLinks });
});

// Optional debug info
app.get('/api/file/:token', (req, res) => {
  const rec = files.get(req.params.token);
  if (!rec) return res.status(404).json({ ok: false });
  const { buffer, ...rest } = rec;
  res.json({ ok: true, token: req.params.token, ...rest });
});

// ===== Lock / Unlock (in-memory) =====
app.post('/api/lock/:token', (req, res) => {
  const rec = files.get(req.params.token);
  if (!rec) return res.status(404).json({ ok: false, error: 'Not found' });

  const pw = (req.body?.password || '').trim();
  if (!pw) return res.status(400).json({ ok: false, error: 'Password required' });

  rec.locked = true;
  rec.password = pw; // dev only (plain). Ganti hash kalau perlu.
  return res.json({ ok: true });
});

// DELETE preferred: body {password}
app.delete('/api/lock/:token', (req, res) => {
  const rec = files.get(req.params.token);
  if (!rec) return res.status(404).json({ ok: false, error: 'Not found' });

  const pw = (req.body?.password || '').trim();
  if (!pw || pw !== rec.password)
    return res.status(403).json({ ok: false, error: 'Wrong password' });

  rec.locked = false;
  rec.password = '';
  return res.json({ ok: true });
});

// Fallback unlock: POST ?unlock=1 + header x-password
app.post('/api/lock/:token', (req, res) => {
  if (req.query.unlock !== '1')
    return res.status(405).json({ ok: false, error: 'Use POST /api/lock/:token to lock' });

  const rec = files.get(req.params.token);
  if (!rec) return res.status(404).json({ ok: false, error: 'Not found' });

  const pw = (req.headers['x-password'] || '').toString().trim();
  if (!pw || pw !== rec.password)
    return res.status(403).json({ ok: false, error: 'Wrong password' });

  rec.locked = false;
  rec.password = '';
  return res.json({ ok: true });
});

// ===== Multer error handler (letakkan SETELAH routes di atas) =====
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ ok:false, error:`File terlalu besar. Maksimal ${MAX_FILE_MB} MB per file.` });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ ok:false, error:`Terlalu banyak file. Maksimal ${MAX_FILES} file.` });
    }
    return res.status(400).json({ ok:false, error:`Upload error: ${err.message}` });
  }
  next(err);
});

// ===== Auto-prune expired (BUKAN clear semua) =====
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [k, rec] of files) {
    const expiredByTtl = rec.expiresAt && now > rec.expiresAt;
    if (rec.expired || expiredByTtl) { files.delete(k); removed++; }
  }
  if (removed) console.log(`[ImpactQR] Pruned ${removed} expired link(s).`);
}, Math.max(10, PRUNE_INTERVAL_SEC) * 1000);

// ===== Helpers (HTML & utils) =====
function sanitize(name = '') {
  return name.replace(/[\r\n"]/g, '_');
}
function renderLockedPage({ token, filename }) {
  return `
<!doctype html><meta charset="utf-8">
<title>Link dikunci</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;font:16px system-ui;background:#0f1016;color:#e8e8ef}
.card{padding:28px;border:1px solid rgba(255,255,255,.06);border-radius:16px;background:#151622;max-width:600px}</style>
<div class="card">
  <h2>🔒 Link dikunci</h2>
  <p>File: <b>${sanitize(filename)}</b></p>
  <p>Token: <code>${token}</code></p>
  <p>Mintalah pembuat link untuk membuka kunci terlebih dahulu.</p>
</div>`;
}
function renderExpiredPage({ token, downloads, maxDownloads, filename }) {
  const reason =
    maxDownloads == null
      ? 'Tautan ini sudah tidak tersedia.'
      : 'Batas unduhan terpenuhi (' + downloads + '/' + maxDownloads + ').';

  return `
<!doctype html><meta charset="utf-8">
<title>Link expired</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;font:16px system-ui;background:#0f1016;color:#e8e8ef}
.card{padding:28px;border:1px solid rgba(255,255,255,.06);border-radius:16px;background:#151622;max-width:600px}</style>
<div class="card">
  <h2>Link expired</h2>
  <p>${reason}</p>
  <p>File: <b>${sanitize(filename)}</b></p>
  <p>Token: <code>${token}</code></p>
</div>`;
}

function renderNotFoundPage() {
  return `
<!doctype html><meta charset="utf-8">
<title>Tidak ditemukan</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;font:16px system-ui;background:#0f1016;color:#e8e8ef}
.card{padding:28px;border:1px solid rgba(255,255,255,.06);border-radius:16px;background:#151622;max-width:600px}</style>
<div class="card">
  <h2>404 • Tautan tidak ditemukan</h2>
  <p>Periksa kembali URL atau unggah file baru.</p>
</div>`;
}

// ===== Start =====
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API ready on http://localhost:${PORT}`);
});
