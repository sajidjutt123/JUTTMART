# 🛒 JUTT MART

A futuristic storefront for premium dry fruits and electronics — built as a
single-page app with a real Node/Express backend (SQLite by default, optional
Postgres for persistent orders), a WebGL particle backdrop and 3D interactions
throughout.

![JUTT MART](public/images/og-cover.jpg)

---

## Quick start

```bash
npm install
npm start          # http://localhost:3000
```

| Script             | What it does                                     |
| ------------------ | ------------------------------------------------ |
| `npm start`        | Run the server on port 3000                      |
| `npm run dev`      | Same, with auto-reload (`node --watch`)          |
| `npm run seed`     | Re-seed the product catalogue (SQLite or Postgres) |
| `npm test`         | Headless UI smoke test (jsdom) — 23 checks       |
| `npm run test:api` | API contract tests — 42 checks                   |
| `npm run test:wa`  | UI smoke test in watch mode — reruns on every save |

> Requires **Node 22+** (uses the built-in `node:sqlite` module, so there is no
> native build step and no database server to install).

---

## What's inside

### Backend — `server/`

A small REST API with two interchangeable storage backends, selected at boot:

- **SQLite** (default, zero setup) — Node's built-in `node:sqlite`; the file is
  created and seeded automatically on first boot.
- **Postgres** — set the `DATABASE_URL` environment variable and the same code
  talks to any managed Postgres (Render, Neon, Supabase, …). Orders and
  messages then survive redeploys and restarts — see
  [Deploy → Data persistence](#data-persistence).

If Postgres is configured but unreachable, the app logs a warning and falls
back to SQLite so the storefront stays up (`/api/health` reports which backend
is live under `storage`).

| Endpoint                  | Method | Purpose                                        |
| ------------------------- | ------ | ---------------------------------------------- |
| `/api/health`             | GET    | Uptime probe                                   |
| `/api/config`             | GET    | Brand, shipping rules, contact details         |
| `/api/categories`         | GET    | All categories                                 |
| `/api/products`           | GET    | List — supports `?category=`, `?search=`, `?sort=`, `?limit=` |
| `/api/products/:slug`     | GET    | One product + related items (increments views) |
| `/api/cart/quote`         | POST   | Server-authoritative cart pricing              |
| `/api/orders`             | POST   | Place an order → returns `JM-YYYY-XXXXXX`      |
| `/api/orders/:id`         | GET    | Look up an order                               |
| `/api/messages`           | POST   | Contact form submissions                       |
| `/api/stats`              | GET    | Catalogue / order counters                     |

**Sort options:** `featured`, `price-asc`, `price-desc`, `rating`, `popular`.

**Security & correctness**

- **Prices are never trusted from the client.** `/api/cart/quote` and
  `/api/orders` recompute every line from the database, so tampering with the
  payload cannot change what you pay.
- Quantities are clamped to `1…99`; unknown product slugs are dropped.
- `helmet` sets a strict CSP (no inline scripts), `express-rate-limit` caps
  `/api/*` at 300 req/min, and all input is length-limited and trimmed.
- All user-supplied strings are HTML-escaped before rendering.

**Tables:** `categories`, `products`, `orders`, `messages` — with indexes on
`products.category` and `orders.created_at` (SQLite additionally runs in WAL
mode; Postgres needs no extra setup).

### Frontend — `public/`

No framework, no build step. ES modules straight to the browser.

- **WebGL backdrop** (`js/scene.js`) — 3,200 drifting particles plus four
  wireframe polyhedra that parallax with the pointer and scroll. Pauses when the
  tab is hidden, halves the particle count on mobile, and degrades to a pure-CSS
  aurora if WebGL is unavailable.
- **3D tilt cards** — product and category cards rotate in perspective and track
  a radial spotlight under the cursor.
- **Glassmorphism UI** — blurred surfaces, neon gradients, animated scanlines
  and a holographic grid.
- **Live shopping** — filter chips, debounced search, sort, quick-view modal,
  slide-out cart drawer, quantity steppers, toast notifications and a full
  checkout flow that returns a real order reference.
- **Cart persistence** via `localStorage`, revalidated against the server on
  every render.
- Scroll-reveal animations, animated stat counters, and a full
  `prefers-reduced-motion` path that disables the 3D layer entirely.

---

## Project layout

```
public/
  index.html          single-page shell
  css/style.css       design system (tokens, glass, 3D, responsive)
  js/app.js           API client, cart, rendering, interactions
  js/scene.js         three.js particle + wireframe backdrop
  vendor/             three.js (vendored, no CDN dependency)
  images/             product photography + OG cover
server/
  index.js            Express app, routes, security middleware
  db.js               SQLite/Postgres schema, seeding, queries (auto-detects DATABASE_URL)
  seed.js             manual re-seed entry point
  data/products.js    canonical catalogue
scripts/
  api-test.mjs        API contract tests
  smoke.mjs           jsdom UI smoke test
```

---

## Test results

```
API tests      42/42 passed
UI smoke test  23/23 passed
```

The smoke test bundles the real `app.js` with esbuild, runs it inside jsdom
against a live server, and drives the actual UI: rendering, filtering, adding to
cart, incrementing quantity, opening the quick-view modal, completing checkout
and submitting the contact form.

---

## Deploy (make it live)

This is a **Node app**, not a static site, so GitHub Pages cannot host it. Any
Node host works — config files for the common ones are already in the repo.

The server reads four environment variables:

| Variable        | Default              | Purpose                                          |
| --------------- | -------------------- | ------------------------------------------------ |
| `PORT`          | `3000`               | Port to listen on (hosts set it)                 |
| `HOST`          | `0.0.0.0`            | Bind address                                     |
| `JUTTMART_DB`   | `server/juttmart.db` | SQLite file location (SQLite backend only)       |
| `DATABASE_URL`  | *(unset)*            | Managed Postgres connection string — set it and orders/messages persist across restarts |

### Render + Neon — fully free, permanent (recommended)

Web hosting and the database are both free **and** permanent — no credit card
anywhere, and orders survive redeploys:

1. **Code** — this repo is on GitHub already.
2. **Database** — go to [neon.tech](https://neon.tech), sign in with GitHub
   (free plan, no card), **Create project**, pick region **Singapore** (fastest
   from Pakistan), and copy the connection string.
3. **Web** — go to [render.com](https://render.com), sign in with GitHub,
   **New +** → **Blueprint** → pick the `JUTTMART` repo. Render reads
   [`render.yaml`](render.yaml) and deploys the web service.
4. **Connect** — in Render, open your service → **Environment**, paste the
   Neon connection string as `DATABASE_URL`, save, and hit **Deploy**.

Done — live at `https://juttmart.onrender.com`. Check `https://juttmart.onrender.com/api/health`
shows `"storage":"postgres"`; place a test order, then push a change and
confirm the order is still there after the redeploy.

> ⚠️ Render also offers a free Postgres, but it is **deleted after ~30–90 days**
> unless upgraded — fine for a demo, wrong for a live shop. Neon's free tier is
> permanent (0.5 GB storage, 100 compute-hours/month, scale-to-zero). For a
> shop this size that is effectively unlimited — a decade of orders and
> messages is a few MB, and the database only runs while your site is being
> used. Supabase is an equivalent alternative (its free projects pause after a
> week of inactivity, so Neon is the better default here).

Free-tier behavior: the web service sleeps after ~15 min without visitors and
takes ~30 s to wake on the next request. A free [UptimeRobot](https://uptimerobot.com)
monitor hitting `/api/health` every 5 minutes keeps it warm at $0.

### Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**.
2. Pick the repo. It autodetects Node and runs `npm start`.

### Fly.io — best for Pakistan (Singapore region, keeps orders)

```bash
fly launch --no-deploy
fly volumes create juttmart_data --size 1 --region sin
fly deploy
```

Uses [`fly.toml`](fly.toml) + [`Dockerfile`](Dockerfile). The volume keeps the
SQLite database across deploys.

### Any Docker host

```bash
docker build -t juttmart .
docker run -p 3000:3000 -v juttmart_data:/data juttmart
```

### Custom domain

The repo previously had a `CNAME` for GitHub Pages. On a Node host you instead
add the domain in the host's dashboard and point DNS at it:

- **Render:** Settings → Custom Domains → add `juttmart.com`, then create the
  `CNAME` record it shows you.
- **Fly:** `fly certs add juttmart.com`

HTTPS is issued automatically on all of the above.

### Data persistence

On free tiers the filesystem is **ephemeral**, so with plain SQLite the
catalogue re-seeds on every boot (fine) but **customer orders are wiped on
redeploy**. Two ways to keep them:

1. **Set `DATABASE_URL` to a managed Postgres** (recommended — works on every
   host, no disk to manage). Orders and messages are written to Postgres and
   survive restarts. See [Render + Neon above](#render--neon--fully-free-permanent-recommended).
2. **Attach a persistent disk** for the SQLite file — Fly volume (see above) or
   a paid Render disk (uncomment the `disk:` block in `render.yaml`).

The app never mixes backends in one process: whichever is active at boot (see
`storage` in `/api/health`) handles everything, and the schema is created
automatically either way.

---

## Notes

- The SQLite file (`server/*.db`) is gitignored — the catalogue re-seeds on boot,
  while orders and messages are runtime data. With Postgres, everything lives
  in the hosted database instead.
- `npm run seed` works against whichever backend is active.
- `three.js` is vendored into `public/vendor/` so the site works without a CDN.
- Shipping: flat **Rs 250**, free over **Rs 5,000** (configured in
  `server/index.js`).

---

© JUTT MART · Built in Lahore, Pakistan
