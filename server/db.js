/**
 * Persistence layer for JUTT MART.
 *
 * Uses Node's built-in `node:sqlite` module (Node >= 22) so there is no native
 * build step and no external database server to run. The file lives at
 * server/juttmart.db and is created + seeded automatically on first boot.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRODUCTS, CATEGORIES } from './data/products.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.JUTTMART_DB || join(__dirname, 'juttmart.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    slug     TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    tagline  TEXT NOT NULL,
    accent   TEXT NOT NULL,
    icon     TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    slug       TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    unit       TEXT NOT NULL,
    category   TEXT NOT NULL REFERENCES categories(slug),
    price      INTEGER NOT NULL,
    compare_at INTEGER,
    image      TEXT NOT NULL,
    rating     REAL NOT NULL DEFAULT 0,
    reviews    INTEGER NOT NULL DEFAULT 0,
    stock      INTEGER NOT NULL DEFAULT 0,
    badge      TEXT,
    blurb      TEXT NOT NULL,
    highlights TEXT NOT NULL DEFAULT '[]',
    views      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    contact    TEXT NOT NULL,
    city       TEXT,
    note       TEXT,
    items      TEXT NOT NULL,
    subtotal   INTEGER NOT NULL,
    shipping   INTEGER NOT NULL,
    total      INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    contact    TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_orders_created   ON orders(created_at DESC);
`);

/** Insert catalogue rows if they are missing; never clobbers live counters. */
export function seed() {
  const upsertCategory = db.prepare(`
    INSERT INTO categories (slug, name, tagline, accent, icon, position)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name, tagline = excluded.tagline,
      accent = excluded.accent, icon = excluded.icon, position = excluded.position
  `);
  CATEGORIES.forEach((c, i) =>
    upsertCategory.run(c.slug, c.name, c.tagline, c.accent, c.icon, i),
  );

  // Preserve `views` across restarts: only the descriptive columns are updated.
  const upsertProduct = db.prepare(`
    INSERT INTO products
      (slug, name, unit, category, price, compare_at, image,
       rating, reviews, stock, badge, blurb, highlights)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name, unit = excluded.unit, category = excluded.category,
      price = excluded.price, compare_at = excluded.compare_at,
      image = excluded.image, rating = excluded.rating, reviews = excluded.reviews,
      stock = excluded.stock, badge = excluded.badge, blurb = excluded.blurb,
      highlights = excluded.highlights
  `);
  for (const p of PRODUCTS) {
    upsertProduct.run(
      p.slug, p.name, p.unit, p.category, p.price, p.compareAt ?? null,
      p.image, p.rating, p.reviews, p.stock, p.badge ?? null, p.blurb,
      JSON.stringify(p.highlights ?? []),
    );
  }
}

/** Map a raw SQLite row into the JSON shape the frontend consumes. */
export function rowToProduct(row) {
  if (!row) return null;
  const price = row.price;
  const compareAt = row.compare_at ?? null;
  return {
    slug: row.slug,
    name: row.name,
    unit: row.unit,
    category: row.category,
    price,
    compareAt,
    discount: compareAt ? Math.round(((compareAt - price) / compareAt) * 100) : 0,
    image: row.image,
    rating: row.rating,
    reviews: row.reviews,
    stock: row.stock,
    inStock: row.stock > 0,
    badge: row.badge,
    blurb: row.blurb,
    highlights: JSON.parse(row.highlights || '[]'),
    views: row.views,
  };
}

export const queries = {
  allCategories: () => db.prepare('SELECT * FROM categories ORDER BY position').all(),

  products({ category, search, sort = 'featured', limit = 100 } = {}) {
    const where = [];
    const params = [];
    if (category && category !== 'all') {
      where.push('category = ?');
      params.push(category);
    }
    if (search) {
      where.push('(LOWER(name) LIKE ? OR LOWER(blurb) LIKE ?)');
      const like = `%${String(search).toLowerCase()}%`;
      params.push(like, like);
    }
    const order = {
      'price-asc': 'price ASC',
      'price-desc': 'price DESC',
      rating: 'rating DESC, reviews DESC',
      popular: 'views DESC, reviews DESC',
      featured: 'rating DESC, price ASC',
    }[sort] || 'rating DESC, price ASC';

    const sql =
      `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''}` +
      ` ORDER BY ${order} LIMIT ?`;
    return db.prepare(sql).all(...params, Math.min(Number(limit) || 100, 200));
  },

  productBySlug: (slug) => db.prepare('SELECT * FROM products WHERE slug = ?').get(slug),

  bumpViews: (slug) =>
    db.prepare('UPDATE products SET views = views + 1 WHERE slug = ?').run(slug),

  insertOrder: (o) =>
    db
      .prepare(
        `INSERT INTO orders (id, name, contact, city, note, items,
                             subtotal, shipping, total, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(o.id, o.name, o.contact, o.city, o.note, JSON.stringify(o.items),
           o.subtotal, o.shipping, o.total, o.status, o.createdAt),

  orderById: (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id),

  insertMessage: (m) =>
    db
      .prepare(
        'INSERT INTO messages (name, contact, body, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(m.name, m.contact, m.body, m.createdAt),

  stats() {
    const p = db.prepare('SELECT COUNT(*) n FROM products').get();
    const o = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM orders').get();
    const v = db.prepare('SELECT COALESCE(SUM(views),0) n FROM products').get();
    return {
      products: p.n,
      orders: o.n,
      revenue: o.s,
      views: v.n,
    };
  },
};

seed();
