# 🛒 JUTT MART

A futuristic storefront for premium dry fruits and electronics — built as a
single-page app with a real Node/Express + SQLite backend, a WebGL particle
backdrop and 3D interactions throughout.

![JUTT MART](public/images/og-cover.jpg)

---

## Quick start

```bash
npm install
npm start          # http://localhost:3000
```

| Script          | What it does                                     |
| --------------- | ------------------------------------------------ |
| `npm start`     | Run the server on port 3000                      |
| `npm run dev`   | Same, with auto-reload (`node --watch`)          |
| `npm run seed`  | Re-seed the product catalogue into SQLite        |
| `npm test`      | Headless UI smoke test (jsdom) — 23 checks       |
| `npm run test:api` | API contract tests — 42 checks                |

> Requires **Node 22+** (uses the built-in `node:sqlite` module, so there is no
> native build step and no database server to install).

---

## What's inside

### Backend — `server/`

A small REST API over SQLite. The database file is created and seeded
automatically on first boot.

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

**Tables:** `categories`, `products`, `orders`, `messages` — with WAL mode and
indexes on `products.category` and `orders.created_at`.

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
  db.js               SQLite schema, seeding, queries
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

## Notes

- The SQLite file (`server/*.db`) is gitignored — the catalogue re-seeds on boot,
  while orders and messages are runtime data.
- `three.js` is vendored into `public/vendor/` so the site works without a CDN.
- Shipping: flat **Rs 250**, free over **Rs 5,000** (configured in
  `server/index.js`).

---

© JUTT MART · Built in Lahore, Pakistan
