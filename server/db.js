/**
 * Persistence layer for JUTT MART — SQLite by default, Postgres optional.
 *
 * No `DATABASE_URL`  → Node's built-in `node:sqlite` (Node >= 22): no native
 *                      build step, no database server to run. The file lives
 *                      at server/juttmart.db (or $JUTTMART_DB) and is created
 *                      + seeded automatically on first boot.
 * `DATABASE_URL` set → managed Postgres via `pg` (Render, Neon, Supabase, …).
 *                      Orders and messages then survive redeploys/restarts,
 *                      which free-tier ephemeral filesystems cannot offer.
 *
 * Both backends expose the same async query interface, so `server/index.js`
 * and the seed script never need to know which one is active. If Postgres is
 * configured but unreachable at boot, the app logs a loud warning and falls
 * back to SQLite so the storefront stays up.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { PRODUCTS, CATEGORIES } from './data/products.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

/* ------------------------------------------------------------------ schema */
const SHARED_SCHEMA = `
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

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_orders_created   ON orders(created_at DESC);
`;

const MESSAGE_TABLE = {
  sqlite: `CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    contact    TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  postgres: `CREATE TABLE IF NOT EXISTS messages (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    contact    TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
};

/* --------------------------------------------------------------- adapters */
/** node:sqlite adapter — synchronous under the hood, awaited at call sites. */
class SqliteDb {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  exec(sql) {
    this.db.exec(sql);
  }

  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      run: (...p) => stmt.run(...p),
      get: (...p) => stmt.get(...p),
      all: (...p) => stmt.all(...p),
    };
  }
}

/**
 * pg adapter — rewrites `?` placeholders to `$1, $2, …` so the exact same SQL
 * strings work on both backends, then awaits the pool.
 */
class PgDb {
  constructor(connectionString) {
    // Managed providers (Neon, Supabase, Render) require TLS. We skip SSL only
    // for loopback hosts (local dev). rejectUnauthorized: false keeps proxies
    // and custom domains from breaking the handshake.
    const local = /@(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(connectionString);
    this.pool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 5000,
      ...(local ? {} : { ssl: { rejectUnauthorized: false } }),
    });
    this.pool.on('error', (err) => console.error('[pg] idle client error:', err.message));
  }

  async exec(sql) {
    await this.pool.query(sql);
  }

  prepare(sql) {
    let i = 0;
    const text = sql.replace(/\?/g, () => `$${++i}`);
    return {
      run: async (...p) => {
        const r = await this.pool.query(text, p);
        return { changes: r.rowCount ?? 0 };
      },
      get: async (...p) => (await this.pool.query(text, p)).rows[0] ?? null,
      all: async (...p) => (await this.pool.query(text, p)).rows,
    };
  }
}

/* --------------------------------------------------------------- selection */
let db;
export let backend = process.env.DATABASE_URL ? 'postgres' : 'sqlite';

function openSqlite() {
  db = new SqliteDb(process.env.JUTTMART_DB || join(__dirname, 'juttmart.db'));
  backend = 'sqlite';
}

function openPostgres(url) {
  db = new PgDb(url);
  backend = 'postgres';
}

if (backend === 'postgres') openPostgres(process.env.DATABASE_URL);
else openSqlite();

/** Create schema + seed the catalogue; Postgres failures degrade to SQLite. */
async function initDb() {
  try {
    await db.exec(SHARED_SCHEMA + MESSAGE_TABLE[backend]);
    await seed();
  } catch (err) {
    if (backend !== 'postgres') throw err;
    console.error('[db] ⚠️  Postgres unreachable —', err.message);
    console.error('[db]    Falling back to SQLite: the store stays up, but orders');
    console.error('[db]    will NOT survive redeploys. Fix DATABASE_URL to persist them.');
    openSqlite();
    await db.exec(SHARED_SCHEMA + MESSAGE_TABLE[backend]);
    await seed();
  }
}

/** Insert catalogue rows if they are missing; never clobbers live counters. */
export async function seed() {
  const upsertCategory = db.prepare(`
    INSERT INTO categories (slug, name, tagline, accent, icon, position)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name, tagline = excluded.tagline,
      accent = excluded.accent, icon = excluded.icon, position = excluded.position
  `);
  for (const [i, c] of CATEGORIES.entries()) {
    await upsertCategory.run(c.slug, c.name, c.tagline, c.accent, c.icon, i);
  }

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
    await upsertProduct.run(
      p.slug, p.name, p.unit, p.category, p.price, p.compareAt ?? null,
      p.image, p.rating, p.reviews, p.stock, p.badge ?? null, p.blurb,
      JSON.stringify(p.highlights ?? []),
    );
  }
}

/** Map a raw row into the JSON shape the frontend consumes. */
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
  allCategories: async () =>
    db.prepare('SELECT * FROM categories ORDER BY position').all(),

  async products({ category, search, sort = 'featured', limit = 100 } = {}) {
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

  productBySlug: async (slug) =>
    db.prepare('SELECT * FROM products WHERE slug = ?').get(slug),

  bumpViews: async (slug) =>
    db.prepare('UPDATE products SET views = views + 1 WHERE slug = ?').run(slug),

  insertOrder: async (o) =>
    db
      .prepare(
        `INSERT INTO orders (id, name, contact, city, note, items,
                             subtotal, shipping, total, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(o.id, o.name, o.contact, o.city, o.note, JSON.stringify(o.items),
           o.subtotal, o.shipping, o.total, o.status, o.createdAt),

  orderById: async (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id),

  insertMessage: async (m) =>
    db
      .prepare('INSERT INTO messages (name, contact, body, created_at) VALUES (?, ?, ?, ?)')
      .run(m.name, m.contact, m.body, m.createdAt),

  async stats() {
    // COUNT/SUM arrive as strings on Postgres (INT8) — Number() normalises.
    const p = await db.prepare('SELECT COUNT(*) n FROM products').get();
    const o = await db.prepare('SELECT COUNT(*) n, COALESCE(SUM(total),0) s FROM orders').get();
    const v = await db.prepare('SELECT COALESCE(SUM(views),0) n FROM products').get();
    return {
      products: Number(p.n),
      orders: Number(o.n),
      revenue: Number(o.s),
      views: Number(v.n),
    };
  },
};

/* Boot: create schema + seed the catalogue. */
await initDb();
