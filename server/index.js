// server/index.js (In-memory only)
// Semua file disimpan di RAM, otomatis hilang saat server restart
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuid } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Multer memory storage
const upload = multer({ storage: multer.memoryStorage() });

// In-memory map: token -> { buffer, filename, size, createdAt, downloads, maxDownloads, expired }
const files = new Map();

// Stats global
let totalUploads = 0;
let totalDownloads = 0;
let totalBytesUploaded = 0;

// Upload single file
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No file' });

  let maxDownloads = null;
  if (req.body?.maxDownloads) {
    const n = Number(req.body.maxDownloads);
    if (Number.isFinite(n) && n > 0) maxDownloads = n;
  }

  const token = uuid().slice(0, 8);
  const rec = {
    buffer: req.file.buffer,
    filename: req.file.originalname,
    size: req.file.size,
    createdAt: Date.now(),
    downloads: 0,
    maxDownloads,
    expired: false
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

// Download route
app.get('/d/:token', (req, res) => {
  const rec = files.get(req.params.token);
  if (!rec) return res.status(404).send(renderNotFoundPage());

  const hitLimit = rec.maxDownloads != null && rec.downloads >= rec.maxDownloads;
  if (rec.expired || hitLimit) {
    rec.expired = true;
    return res.status(410).send(renderExpiredPage({
      token: req.params.token,
      downloads: rec.downloads,
      maxDownloads: rec.maxDownloads,
      filename: rec.filename
    }));
  }

  rec.downloads += 1;
  totalDownloads += 1;
  if (rec.maxDownloads != null && rec.downloads >= rec.maxDownloads) rec.expired = true;

  res.setHeader('Content-Disposition', `attachment; filename="${rec.filename}"`);
  res.send(rec.buffer);
});

// Cek token aktif
app.get('/api/exists/:token', (req, res) => {
  const rec = files.get(req.params.token);
  const ok = !!rec && !rec.expired && !(rec.maxDownloads != null && rec.downloads >= rec.maxDownloads);
  res.json({ ok });
});

// Stats
app.get('/api/stats', (req, res) => {
  let activeLinks = 0;
  for (const rec of files.values()) {
    const available = !rec.expired && !(rec.maxDownloads != null && rec.downloads >= rec.maxDownloads);
    if (available) activeLinks++;
  }
  const avgSize = totalUploads ? Math.round(totalBytesUploaded / totalUploads) : 0;
  res.json({ totalUploads, totalDownloads, avgSize, activeLinks });
});

// Auto-clear setiap 3 jam
setInterval(() => {
  files.clear();
  console.log('In-memory storage cleared.');
}, 3 * 60 * 60 * 1000);

// Helper pages
function renderExpiredPage({ token, downloads, maxDownloads, filename }) {
  const reason = maxDownloads == null
    ? 'Tautan ini sudah tidak tersedia.'
    : `Batas unduhan terpenuhi (${downloads}/${maxDownloads}).`;

  return `
    <html><body style="font-family:sans-serif;background:#111;color:#fff;text-align:center;padding:50px">
    <h1>Link expired</h1>
    <p>${reason}</p>
    <p><b>${filename}</b> — Token: ${token}</p>
    </body></html>
  `;
}

function renderNotFoundPage() {
  return `
    <html><body style="font-family:sans-serif;background:#111;color:#fff;text-align:center;padding:50px">
    <h1>404</h1>
    <p>File tidak ditemukan.</p>
    </body></html>
  `;
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));
