/**
 * JUTT MART — API + static host.
 *
 * Run:  npm start          (production-ish)
 *       npm run dev        (auto-reload via node --watch)
 */
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { queries, rowToProduct, backend } from './db.js';
import { HERO_IMAGES } from './data/products.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SHIPPING_FLAT = 250;
const FREE_SHIPPING_OVER = 5000;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ----------------------------------------------------------------- security */
// CSP is configured for the sandbox preview: the app is served inside an
// iframe, so frameguard is off and frame-ancestors is permissive.
app.use(
  helmet({
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'connect-src': ["'self'"],
        'frame-ancestors': ['*'],
        'upgrade-insecure-requests': null,
      },
    },
  }),
);
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '64kb' }));

app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
  }),
);

/* ------------------------------------------------------------------ helpers */
const asInt = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const clean = (v, max = 400) => String(v ?? '').trim().slice(0, max);

/** Express 4 does not catch rejected promises — wrap async handlers. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function shippingFor(subtotal) {
  return subtotal >= FREE_SHIPPING_OVER || subtotal === 0 ? 0 : SHIPPING_FLAT;
}

/* --------------------------------------------------------------------- API */
app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    storage: backend, // 'sqlite' (default) or 'postgres' (DATABASE_URL set)
    uptime: Math.round(process.uptime()),
    now: new Date().toISOString(),
  }),
);

app.get('/api/config', (_req, res) =>
  res.json({
    brand: 'JUTT MART',
    tagline: 'Premium dry fruits & next-gen electronics, delivered across Pakistan.',
    currency: 'PKR',
    shipping: { flat: SHIPPING_FLAT, freeOver: FREE_SHIPPING_OVER },
    contact: {
      instagram: 'https://www.instagram.com/sajid.anonymous/',
      email: 'juttboys4540@gmail.com',
      location: 'Lahore, Pakistan',
    },
    heroImages: HERO_IMAGES,
  }),
);

app.get('/api/categories', ah(async (_req, res) =>
  res.json({ categories: await queries.allCategories() }),
));

app.get('/api/products', ah(async (req, res) => {
  const { category, search, sort, limit } = req.query;
  const rows = await queries.products({ category, search, sort, limit });
  res.json({ count: rows.length, products: rows.map(rowToProduct) });
}));

app.get('/api/products/:slug', ah(async (req, res) => {
  const row = await queries.productBySlug(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  await queries.bumpViews(req.params.slug);
  const related = (await queries.products({ category: row.category, limit: 5 }))
    .filter((r) => r.slug !== row.slug)
    .slice(0, 4)
    .map(rowToProduct);
  res.json({ product: rowToProduct(row), related });
}));

app.get('/api/stats', ah(async (_req, res) => res.json(await queries.stats())));

/** Server-authoritative cart pricing — the client never dictates totals. */
app.post('/api/cart/quote', ah(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
  const lines = [];
  let subtotal = 0;

  for (const raw of items) {
    const row = await queries.productBySlug(clean(raw?.slug, 80));
    if (!row) continue;
    const qty = Math.max(1, Math.min(asInt(raw?.qty, 1), 99));
    const lineTotal = row.price * qty;
    subtotal += lineTotal;
    lines.push({
      slug: row.slug,
      name: row.name,
      unit: row.unit,
      image: row.image,
      price: row.price,
      qty,
      lineTotal,
      stock: row.stock,
    });
  }

  const shipping = shippingFor(subtotal);
  res.json({
    lines,
    subtotal,
    shipping,
    total: subtotal + shipping,
    freeShippingOver: FREE_SHIPPING_OVER,
    remainingForFreeShipping: Math.max(0, FREE_SHIPPING_OVER - subtotal),
  });
}));

app.post('/api/orders', ah(async (req, res) => {
  const name = clean(req.body?.name, 80);
  const contact = clean(req.body?.contact, 120);
  const city = clean(req.body?.city, 80);
  const note = clean(req.body?.note, 500);
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];

  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  if (contact.length < 5)
    return res.status(400).json({ error: 'Please enter a phone number, email or Instagram handle.' });
  if (!items.length) return res.status(400).json({ error: 'Your cart is empty.' });

  const lines = [];
  let subtotal = 0;
  for (const raw of items) {
    const row = await queries.productBySlug(clean(raw?.slug, 80));
    if (!row) continue;
    const qty = Math.max(1, Math.min(asInt(raw?.qty, 1), 99));
    subtotal += row.price * qty;
    lines.push({ slug: row.slug, name: row.name, price: row.price, qty });
  }
  if (!lines.length) return res.status(400).json({ error: 'No valid items in cart.' });

  const shipping = shippingFor(subtotal);
  const order = {
    id: `JM-${new Date().getFullYear()}-${randomUUID().slice(0, 6).toUpperCase()}`,
    name, contact, city, note,
    items: lines,
    subtotal,
    shipping,
    total: subtotal + shipping,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await queries.insertOrder(order);
  res.status(201).json({ order });
}));

app.get('/api/orders/:id', ah(async (req, res) => {
  const row = await queries.orderById(clean(req.params.id, 40));
  if (!row) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: { ...row, items: JSON.parse(row.items) } });
}));

app.post('/api/messages', ah(async (req, res) => {
  const name = clean(req.body?.name, 80);
  const contact = clean(req.body?.contact, 120);
  const body = clean(req.body?.message, 1000);
  if (name.length < 2 || contact.length < 5 || body.length < 5)
    return res.status(400).json({ error: 'Please fill in every field.' });
  await queries.insertMessage({ name, contact, body, createdAt: new Date().toISOString() });
  res.status(201).json({ ok: true, message: 'Thanks! We will get back to you shortly.' });
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));

/* ------------------------------------------------------------------ static */
app.use(
  express.static(PUBLIC_DIR, {
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    extensions: ['html'],
  }),
);
// SPA fallback — every non-API route renders the shell.
app.get('*', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`\n  ⚡ JUTT MART running at http://${HOST}:${PORT}\n`);
});
