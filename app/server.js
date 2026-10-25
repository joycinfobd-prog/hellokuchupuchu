const express = require('express'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || 'admin123';
const SECRET = process.env.SECRET || crypto.createHash('sha256').update('s:' + PASS).digest('hex');
const FILE = path.join(__dirname, 'data', 'content.json');
const UP = path.join(__dirname, 'data', 'uploads');
const load = () => {
  const c = JSON.parse(fs.readFileSync(FILE, 'utf8'));           // fills new fields for older content.json files
  if (!c.photos) c.photos = [];
  if (!c.photoThemes) c.photoThemes = JSON.parse(fs.readFileSync(path.join(__dirname, 'photo-defaults.json'), 'utf8'));
  return c;
};
const save = c => { fs.writeFileSync(FILE + '.tmp', JSON.stringify(c, null, 2)); fs.renameSync(FILE + '.tmp', FILE); };
const pick = a => a[Math.floor(Math.random() * a.length)];
const sign = t => crypto.createHmac('sha256', SECRET).update(t).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

app.set('trust proxy', 1);
app.use((q, r, n) => (q.method === 'POST' && q.path === '/api/admin/photos') ? n() : express.json({ limit: '1mb' })(q, r, n));
app.use('/uploads', express.static(UP, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- text generators: unlimited combos, emoji always matches the theme ----
const gen = themes => { const t = pick(themes); return { text: pick(t.starts) + ' ' + pick(t.ends), emoji: pick(t.emoji) }; };

// Optional: real AI generation (set ANTHROPIC_API_KEY and tick "Use AI" in admin)
async function ai(kind, n) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 400,
        messages: [{ role: 'user', content: `Write ${n} new, short, sweet ${kind} for a romantic birthday website (Bubu & Dudu bear/panda couple theme). One line each, max 12 words, no emoji inside the text. Reply ONLY with JSON: [{"text":"...","emoji":"ONE emoji that matches the text"}]` }]
      })
    });
    const j = await r.json();
    const arr = JSON.parse(j.content[0].text.replace(/```json|```/g, '').trim());
    return arr.slice(0, n).map(x => ({ text: String(x.text), emoji: String(x.emoji) }));
  } catch { return null; }
}
const make = (key, kind) => async (req, res) => {
  const c = load(), n = Math.min(Math.max(+req.query.n || 1, 1), 6);
  let items = c.useAI ? await ai(kind, n) : null;
  if (!items) items = Array.from({ length: n }, () => gen(c[key]));
  res.json({ items });
};

// ---- public API ----
app.get('/api/content', (req, res) => {
  const { momentThemes, reasonThemes, photoThemes, photos, useAI, ...pub } = load();
  res.json(pub);
});
app.get('/api/moments', make('momentThemes', 'cute couple moment captions'));
app.get('/api/reasons', make('reasonThemes', '"reasons I love you" lines'));

app.get('/api/photos', (req, res) => res.json({ photos: load().photos.map(p => ({ id: p.id, src: '/uploads/' + p.file, caption: p.caption || '' })) }));
app.get('/api/photolines', make('photoThemes', 'naughty-cute one-line photo captions (playful, teasing, affectionate)'));

// ---- admin auth (signed, HttpOnly cookie) ----
let fails = 0, lockUntil = 0;
const authed = req => {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)tok=([^;]+)/); if (!m) return false;
  const [ts, sig] = decodeURIComponent(m[1]).split('.');
  return !!sig && safeEq(sig, sign(ts)) && Date.now() - +ts < 7 * 864e5;
};
const guard = (req, res, next) => authed(req) ? next() : res.status(401).json({ error: 'login required' });

app.post('/api/login', (req, res) => {
  if (Date.now() < lockUntil) return res.status(429).json({ error: 'Too many attempts. Wait a minute.' });
  if (!safeEq(String(req.body.password || ''), PASS)) {
    if (++fails >= 5) { lockUntil = Date.now() + 60000; fails = 0; }
    return setTimeout(() => res.status(401).json({ error: 'Wrong password' }), 700);
  }
  fails = 0; const ts = String(Date.now());
  res.cookie('tok', ts + '.' + sign(ts), { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 7 * 864e5 });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { res.clearCookie('tok'); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => res.json({ authed: authed(req) }));
app.get('/api/admin/content', guard, (req, res) => res.json(load()));
app.put('/api/admin/content', guard, (req, res) => {
  const c = req.body, S = a => Array.isArray(a) && a.every(x => typeof x === 'string');
  const T = a => Array.isArray(a) && a.length && a.every(t => S(t.emoji) && t.emoji.length && S(t.starts) && t.starts.length && S(t.ends) && t.ends.length);
  if (!c || !S(c.letter) || !S(c.promises) || !S(c.hug) || !T(c.momentThemes) || !T(c.reasonThemes) || !Array.isArray(c.chips))
    return res.status(400).json({ error: 'Invalid data' });
  const cur = load(), byId = new Map(cur.photos.map(p => [p.id, p]));
  if (!T(c.photoThemes)) c.photoThemes = cur.photoThemes;
  c.photos = (Array.isArray(c.photos) ? c.photos : cur.photos).filter(p => p && byId.has(p.id))
    .map(p => ({ id: p.id, file: byId.get(p.id).file, caption: String(p.caption || '').slice(0, 200) }));
  save(c); res.json({ ok: true });
});

// ---- photo album (unlimited uploads, stored in data/uploads) ----
app.post('/api/admin/photos', guard, express.json({ limit: '15mb' }), (req, res) => {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String((req.body || {}).data || ''));
  if (!m) return res.status(400).json({ error: 'Bad image' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'Image too large' });
  const id = crypto.randomBytes(6).toString('hex'), file = id + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.mkdirSync(UP, { recursive: true }); fs.writeFileSync(path.join(UP, file), buf);
  const c = load(), photo = { id, file, caption: '' }; c.photos.push(photo); save(c); res.json({ photo });
});
app.delete('/api/admin/photos/:id', guard, (req, res) => {
  const c = load(), p = c.photos.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  fs.rm(path.join(UP, p.file), () => {}); c.photos = c.photos.filter(x => x !== p); save(c); res.json({ ok: true });
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => console.log(`Site: http://localhost:${PORT}   Admin: http://localhost:${PORT}/admin`));
if (PASS === 'admin123') console.log('WARNING: default admin password in use. Set ADMIN_PASSWORD.');
