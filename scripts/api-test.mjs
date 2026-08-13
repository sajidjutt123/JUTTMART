/**
 * API contract tests — exercises every endpoint plus validation and the
 * server-authoritative pricing guarantees.
 *
 *   node scripts/api-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3000';

let pass = 0;
let fail = 0;

function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}${extra ? `  (${extra})` : ''}`); }
  else    { fail++; console.log(`  ❌ ${name}${extra ? `  (${extra})` : ''}`); }
}

const get = (p) => fetch(BASE + p).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (p, body) =>
  fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

console.log('\n  JUTT MART API tests\n  ' + '─'.repeat(46));

/* ------------------------------------------------------------------- reads */
const health = await get('/api/health');
check('GET /api/health', health.status === 200 && health.body.ok === true);

const cfg = await get('/api/config');
check('GET /api/config', cfg.body.brand === 'JUTT MART' && cfg.body.shipping.freeOver === 5000);

const cats = await get('/api/categories');
check('GET /api/categories', cats.body.categories.length === 3,
      cats.body.categories.map((c) => c.slug).join(','));

const all = await get('/api/products');
check('GET /api/products', all.body.count === 10, `${all.body.count} products`);
check('products expose computed discount',
      all.body.products.every((p) => typeof p.discount === 'number'));
check('products expose inStock flag',
      all.body.products.every((p) => typeof p.inStock === 'boolean'));

const dry = await get('/api/products?category=dry-fruits');
check('filter by category', dry.body.products.every((p) => p.category === 'dry-fruits'),
      `${dry.body.count} items`);

const search = await get('/api/products?search=almond');
check('search matches name/blurb', search.body.count >= 1, `${search.body.count} hits`);

const asc = await get('/api/products?sort=price-asc');
const prices = asc.body.products.map((p) => p.price);
check('sort price ascending', prices.every((v, i) => i === 0 || prices[i - 1] <= v));

const desc = await get('/api/products?sort=price-desc');
const dPrices = desc.body.products.map((p) => p.price);
check('sort price descending', dPrices.every((v, i) => i === 0 || dPrices[i - 1] >= v));

const one = await get('/api/products/almonds-1kg');
check('GET single product', one.body.product.slug === 'almonds-1kg');
check('related products returned', one.body.related.length > 0 &&
      one.body.related.every((r) => r.slug !== 'almonds-1kg'),
      `${one.body.related.length} related`);

const missing = await get('/api/products/does-not-exist');
check('404 for unknown product', missing.status === 404);

const badRoute = await get('/api/nonsense');
check('404 for unknown endpoint', badRoute.status === 404);

/* ------------------------------------------------------------------ quotes */
const q1 = await post('/api/cart/quote', { items: [{ slug: 'fast-charger', qty: 2 }] });
check('quote: subtotal computed', q1.body.subtotal === 1000, `Rs ${q1.body.subtotal}`);
check('quote: flat shipping under threshold', q1.body.shipping === 250);
check('quote: total = subtotal + shipping', q1.body.total === 1250);
check('quote: reports remaining for free shipping',
      q1.body.remainingForFreeShipping === 4000);

const q2 = await post('/api/cart/quote', { items: [{ slug: 'almonds-1kg', qty: 3 }] });
check('quote: free shipping over Rs 5000', q2.body.shipping === 0, `Rs ${q2.body.subtotal}`);

const tamper = await post('/api/cart/quote', {
  items: [{ slug: 'almonds-1kg', qty: 1, price: 1, lineTotal: 1 }],
});
check('quote ignores client-supplied price', tamper.body.lines[0].price === 2200,
      `server said Rs ${tamper.body.lines[0].price}`);

const clamp = await post('/api/cart/quote', {
  items: [{ slug: 'fast-charger', qty: 9999 }, { slug: 'INJECTED', qty: 3 }],
});
check('quote clamps qty to 99', clamp.body.lines[0].qty === 99);
check('quote drops unknown slugs', clamp.body.lines.length === 1);

const negative = await post('/api/cart/quote', { items: [{ slug: 'fast-charger', qty: -5 }] });
check('quote floors negative qty at 1', negative.body.lines[0].qty === 1);

/* ------------------------------------------------------------------ orders */
const order = await post('/api/orders', {
  name: 'API Tester',
  contact: 'tester@example.com',
  city: 'Lahore',
  items: [{ slug: 'almonds-1kg', qty: 2 }, { slug: 'smartwatch', qty: 1 }],
});
check('POST /api/orders creates order', order.status === 201, order.body.order?.id);
check('order id format JM-YYYY-XXXXXX', /^JM-\d{4}-[A-Z0-9]{6}$/.test(order.body.order.id));
check('order total server-computed', order.body.order.total === 8600,
      `Rs ${order.body.order.total}`);

const fetched = await get(`/api/orders/${order.body.order.id}`);
check('GET order by id', fetched.body.order.id === order.body.order.id);
check('order persisted with items', fetched.body.order.items.length === 2);

check('reject empty name',   (await post('/api/orders', { name: '', contact: 'x@y.com', items: [{ slug: 'almonds-1kg' }] })).status === 400);
check('reject short contact',(await post('/api/orders', { name: 'Ali', contact: '', items: [{ slug: 'almonds-1kg' }] })).status === 400);
check('reject empty cart',   (await post('/api/orders', { name: 'Ali', contact: 'ali@x.com', items: [] })).status === 400);
check('reject all-invalid cart',
      (await post('/api/orders', { name: 'Ali', contact: 'ali@x.com', items: [{ slug: 'FAKE' }] })).status === 400);

/* ---------------------------------------------------------------- messages */
const msg = await post('/api/messages', {
  name: 'Ali', contact: 'ali@example.com', message: 'Do you deliver to Karachi?',
});
check('POST /api/messages', msg.status === 201 && msg.body.ok);
check('reject incomplete message',
      (await post('/api/messages', { name: 'A', contact: '', message: '' })).status === 400);

/* ------------------------------------------------------------------- stats */
const stats = await get('/api/stats');
check('GET /api/stats', stats.body.products === 10 && stats.body.orders >= 1,
      `${stats.body.orders} orders, Rs ${stats.body.revenue}`);

/* ------------------------------------------------------------------ static */
for (const path of ['/', '/css/style.css', '/js/app.js', '/js/scene.js',
                    '/vendor/three.module.min.js', '/images/almonds.jpg']) {
  const r = await fetch(BASE + path);
  check(`static ${path}`, r.status === 200);
}
const spa = await fetch(BASE + '/deep/unknown/route');
check('SPA fallback serves shell', spa.status === 200);

console.log('  ' + '─'.repeat(46));
console.log(`  ${pass}/${pass + fail} passed\n`);
process.exit(fail ? 1 : 0);
