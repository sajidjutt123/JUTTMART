/**
 * JUTT MART storefront logic:
 * API client, cart (localStorage + server-authoritative pricing),
 * product rendering, 3D tilt, scroll reveals and checkout.
 */
import { initScene } from './scene.js';

/* ------------------------------------------------------------------- utils */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const PKR = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
});
const money = (n) => PKR.format(n || 0).replace('PKR', 'Rs');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ------------------------------------------------------------------ toasts */
const toastHost = $('#toasts');

function toast(message, icon = '✅') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="ico">${icon}</span><span>${esc(message)}</span>`;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2900);
}

/* -------------------------------------------------------------------- cart */
const CART_KEY = 'juttmart.cart.v2';

const cart = {
  items: [],

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      this.items = Array.isArray(raw)
        ? raw
            .filter((i) => i && typeof i.slug === 'string')
            .map((i) => ({ slug: i.slug, qty: Math.max(1, Math.min(+i.qty || 1, 99)) }))
        : [];
    } catch {
      this.items = [];
    }
  },

  save() {
    localStorage.setItem(CART_KEY, JSON.stringify(this.items));
    this.paint();
  },

  add(slug, qty = 1) {
    const found = this.items.find((i) => i.slug === slug);
    if (found) found.qty = Math.min(found.qty + qty, 99);
    else this.items.push({ slug, qty });
    this.save();
  },

  setQty(slug, qty) {
    const item = this.items.find((i) => i.slug === slug);
    if (!item) return;
    if (qty <= 0) this.remove(slug);
    else { item.qty = Math.min(qty, 99); this.save(); }
  },

  remove(slug) {
    this.items = this.items.filter((i) => i.slug !== slug);
    this.save();
  },

  clear() { this.items = []; this.save(); },

  get count() { return this.items.reduce((n, i) => n + i.qty, 0); },

  paint() {
    const badge = $('#cart-count');
    badge.textContent = this.count;
    badge.classList.toggle('show', this.count > 0);
    badge.classList.remove('pop');
    void badge.offsetWidth; // restart the animation
    if (this.count > 0) badge.classList.add('pop');
    renderCart();
  },
};

/* ------------------------------------------------------------------- state */
const state = {
  products: [],
  categories: [],
  config: null,
  filter: 'all',
  sort: 'featured',
  search: '',
  quote: null,
};

/* --------------------------------------------------------------- rendering */
function starBar(rating) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function productCard(p) {
  return `
    <article class="card reveal" data-tilt data-slug="${esc(p.slug)}">
      <div class="card-media">
        ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
        ${p.discount > 0 ? `<span class="disc">-${p.discount}%</span>` : ''}
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async">
        ${p.inStock ? '' : '<div class="stock-out">Sold out</div>'}
        <button class="quick" data-view="${esc(p.slug)}">Quick view</button>
      </div>
      <div class="card-body">
        <div class="card-cat">${esc(p.category.replace('-', ' '))}</div>
        <h3 class="card-title">${esc(p.name)}</h3>
        <div class="card-unit">${esc(p.unit)}</div>
        <div class="stars"><b>${starBar(p.rating)}</b> ${p.rating.toFixed(1)} · ${p.reviews} reviews</div>
        <div class="price-row">
          <span class="price">${money(p.price)}</span>
          ${p.compareAt ? `<span class="price-old">${money(p.compareAt)}</span>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn" data-add="${esc(p.slug)}" ${p.inStock ? '' : 'disabled'}>
            ${p.inStock ? 'Add to cart' : 'Sold out'}
          </button>
        </div>
      </div>
    </article>`;
}

async function loadProducts() {
  const grid = $('#product-grid');
  grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join('');

  const params = new URLSearchParams({ sort: state.sort });
  if (state.filter !== 'all') params.set('category', state.filter);
  if (state.search) params.set('search', state.search);

  try {
    const { products } = await api(`/products?${params}`);
    state.products = products;
    grid.innerHTML = products.length
      ? products.map(productCard).join('')
      : `<div class="empty" style="grid-column:1/-1;padding:60px 0">
           <div class="big">🔍</div><p>No products match that search.</p></div>`;
    observeReveals(grid);
    attachTilt(grid);
  } catch (err) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:60px 0">
        <div class="big">⚠️</div><p>${esc(err.message)}</p></div>`;
  }
}

function renderCategories() {
  $('#cat-grid').innerHTML = state.categories
    .map(
      (c) => `
    <article class="cat-card reveal" data-tilt data-cat="${esc(c.slug)}" style="--accent:${esc(c.accent)}">
      <div class="cat-icon">${c.icon}</div>
      <h3>${esc(c.name)}</h3>
      <p>${esc(c.tagline)}</p>
      <div class="cat-link">Browse <span>→</span></div>
    </article>`,
    )
    .join('');

  $('#chips').innerHTML =
    `<button class="chip active" data-filter="all">All</button>` +
    state.categories
      .map((c) => `<button class="chip" data-filter="${esc(c.slug)}">${c.icon} ${esc(c.name)}</button>`)
      .join('');

  observeReveals($('#cat-grid'));
  attachTilt($('#cat-grid'));
}

/* --------------------------------------------------------------- cart view */
async function renderCart() {
  const body = $('#cart-body');
  const foot = $('#cart-foot');

  if (!cart.items.length) {
    body.innerHTML = `<div class="empty"><div class="big">🛒</div>
      <p>Your cart is empty.<br>Add something futuristic.</p></div>`;
    foot.innerHTML = '';
    state.quote = null;
    return;
  }

  try {
    const quote = await api('/cart/quote', {
      method: 'POST',
      body: JSON.stringify({ items: cart.items }),
    });
    state.quote = quote;

    body.innerHTML = quote.lines
      .map(
        (l) => `
      <div class="line">
        <img src="${esc(l.image)}" alt="${esc(l.name)}">
        <div>
          <div class="line-name">${esc(l.name)}</div>
          <div class="line-unit">${esc(l.unit)} · ${money(l.price)}</div>
          <div class="qty">
            <button data-dec="${esc(l.slug)}" aria-label="Decrease">−</button>
            <span>${l.qty}</span>
            <button data-inc="${esc(l.slug)}" aria-label="Increase">+</button>
          </div>
        </div>
        <div style="text-align:right">
          <div class="line-total">${money(l.lineTotal)}</div>
          <button class="line-remove" data-del="${esc(l.slug)}">Remove</button>
        </div>
      </div>`,
      )
      .join('');

    const note =
      quote.remainingForFreeShipping > 0
        ? `<div class="ship-note">Add ${money(quote.remainingForFreeShipping)} more for free delivery 🚚</div>`
        : `<div class="ship-note">Free delivery unlocked ✨</div>`;

    foot.innerHTML = `
      ${note}
      <div class="totals">
        <div><span>Subtotal</span><span>${money(quote.subtotal)}</span></div>
        <div><span>Delivery</span><span>${quote.shipping ? money(quote.shipping) : 'Free'}</span></div>
        <div class="grand"><span>Total</span><span>${money(quote.total)}</span></div>
      </div>
      <button class="btn wide gold" id="checkout-btn">Checkout →</button>
      <button class="btn wide ghost" id="clear-btn" style="margin-top:10px">Clear cart</button>`;
  } catch (err) {
    body.innerHTML = `<div class="empty"><div class="big">⚠️</div><p>${esc(err.message)}</p></div>`;
  }
}

/* ------------------------------------------------------------------ drawer */
const overlay = $('#overlay');
const drawer = $('#drawer');

function openDrawer() {
  drawer.classList.add('open');
  overlay.classList.add('open');
  document.body.classList.add('no-scroll');
}

function closeAll() {
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  $('#modal').classList.remove('open');
  document.body.classList.remove('no-scroll');
}

/* ------------------------------------------------------------------- modal */
async function openProduct(slug) {
  const modal = $('#modal');
  const card = $('#modal-card');
  card.innerHTML = '<div style="padding:60px;text-align:center;color:var(--muted)">Loading…</div>';
  modal.classList.add('open');
  overlay.classList.add('open');
  document.body.classList.add('no-scroll');

  try {
    const { product: p, related } = await api(`/products/${encodeURIComponent(slug)}`);
    card.innerHTML = `
      <button class="modal-close" data-close>✕</button>
      <div class="modal-grid">
        <div class="modal-media"><img src="${esc(p.image)}" alt="${esc(p.name)}"></div>
        <div class="modal-info">
          <div class="eyebrow">${esc(p.category.replace('-', ' '))}</div>
          <h2>${esc(p.name)}</h2>
          <div class="card-unit">${esc(p.unit)}</div>
          <div class="stars"><b>${starBar(p.rating)}</b> ${p.rating.toFixed(1)} · ${p.reviews} reviews</div>
          <p style="color:var(--muted);font-size:.94rem">${esc(p.blurb)}</p>
          <ul class="hl">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
          <div class="price-row">
            <span class="price" style="font-size:1.5rem">${money(p.price)}</span>
            ${p.compareAt ? `<span class="price-old">${money(p.compareAt)}</span>` : ''}
            ${p.discount ? `<span class="disc" style="position:static">-${p.discount}%</span>` : ''}
          </div>
          <p class="form-note">${p.inStock ? `In stock · ${p.stock} available` : 'Currently sold out'}</p>
          <div class="card-actions" style="margin-top:16px">
            <button class="btn" data-add="${esc(p.slug)}" ${p.inStock ? '' : 'disabled'}>Add to cart</button>
            <button class="btn ghost" data-close>Keep browsing</button>
          </div>
          ${
            related.length
              ? `<div style="margin-top:26px">
                   <div class="card-cat" style="margin-bottom:10px">You may also like</div>
                   <div style="display:flex;gap:10px;flex-wrap:wrap">
                     ${related
                       .map(
                         (r) => `<button class="chip" data-view="${esc(r.slug)}">
                                   ${esc(r.name)} · ${money(r.price)}</button>`,
                       )
                       .join('')}
                   </div>
                 </div>`
              : ''
          }
        </div>
      </div>`;
  } catch (err) {
    card.innerHTML = `<button class="modal-close" data-close>✕</button>
      <div style="padding:60px;text-align:center;color:var(--red)">${esc(err.message)}</div>`;
  }
}

/* ---------------------------------------------------------------- checkout */
function openCheckout() {
  if (!cart.items.length) return toast('Your cart is empty.', '🛒');
  const modal = $('#modal');
  const total = state.quote ? money(state.quote.total) : '';

  $('#modal-card').innerHTML = `
    <button class="modal-close" data-close>✕</button>
    <div style="padding:36px 34px">
      <div class="eyebrow">Secure checkout</div>
      <h2 style="font-size:1.6rem;margin-bottom:6px">Confirm your order</h2>
      <p style="color:var(--muted);font-size:.9rem;margin-top:0">
        We will reach out on your contact to arrange payment and delivery.
        Order total: <b style="color:var(--text)">${total}</b>
      </p>
      <form class="form" id="order-form" style="margin-top:20px">
        <input class="input" name="name" placeholder="Full name" required minlength="2">
        <input class="input" name="contact" placeholder="Phone, email or Instagram handle" required minlength="5">
        <input class="input" name="city" placeholder="City (optional)">
        <textarea class="textarea" name="note" placeholder="Delivery notes (optional)"></textarea>
        <div class="form-msg" id="order-msg"></div>
        <button class="btn wide gold" type="submit">Place order</button>
        <p class="form-note">No card needed — cash on delivery or bank transfer.</p>
      </form>
    </div>`;

  drawer.classList.remove('open');
  modal.classList.add('open');
  overlay.classList.add('open');
  document.body.classList.add('no-scroll');

  $('#order-form').addEventListener('submit', submitOrder);
}

async function submitOrder(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = $('#order-msg');
  const btn = form.querySelector('button[type=submit]');
  const data = Object.fromEntries(new FormData(form));

  btn.disabled = true;
  btn.textContent = 'Placing order…';
  msg.className = 'form-msg';

  try {
    const { order } = await api('/orders', {
      method: 'POST',
      body: JSON.stringify({ ...data, items: cart.items }),
    });
    cart.clear();
    $('#modal-card').innerHTML = `
      <button class="modal-close" data-close>✕</button>
      <div style="padding:56px 40px;text-align:center">
        <div style="font-size:3.4rem;margin-bottom:10px">🎉</div>
        <h2 style="font-size:1.6rem">Order confirmed</h2>
        <p style="color:var(--muted)">Reference
          <b style="color:var(--cyan);font-family:Orbitron,sans-serif">${esc(order.id)}</b><br>
          Total <b style="color:var(--text)">${money(order.total)}</b>
        </p>
        <p style="color:var(--muted);font-size:.9rem">
          Thanks ${esc(order.name)}! We will contact you shortly on
          <b style="color:var(--text)">${esc(order.contact)}</b>.
        </p>
        <button class="btn" data-close style="margin-top:14px">Continue shopping</button>
      </div>`;
    toast(`Order ${order.id} placed!`, '🎉');
  } catch (err) {
    msg.className = 'form-msg err show';
    msg.textContent = err.message;
    btn.disabled = false;
    btn.textContent = 'Place order';
  }
}

/* ------------------------------------------------------------- 3D tilt fx */
function attachTilt(root) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(hover: none)').matches) return;

  for (const el of $$('[data-tilt]', root)) {
    let raf = 0;

    const move = (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', `${px * 100}%`);
      el.style.setProperty('--my', `${py * 100}%`);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rx = (0.5 - py) * 13;
        const ry = (px - 0.5) * 15;
        el.style.transform =
          `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-8px) scale(1.02)`;
      });
    };

    const leave = () => {
      cancelAnimationFrame(raf);
      el.style.transform = '';
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
  }
}

/* --------------------------------------------------------- scroll reveals */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry, i) => {
      if (!entry.isIntersecting) return;
      setTimeout(() => entry.target.classList.add('in'), i * 65);
      revealObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
);

function observeReveals(root = document) {
  $$('.reveal:not(.in)', root).forEach((el) => revealObserver.observe(el));
}

/* --------------------------------------------------------- counter numbers */
function animateCount(el, to, suffix = '') {
  const dur = 1500;
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(to * eased).toLocaleString('en-US') + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* -------------------------------------------------------------- delegation */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-add],[data-view],[data-cat],[data-filter],[data-inc],[data-dec],[data-del],[data-close]');
  if (!t) return;

  if (t.dataset.add) {
    cart.add(t.dataset.add);
    const p = state.products.find((x) => x.slug === t.dataset.add);
    toast(`${p?.name ?? 'Item'} added to cart`, '🛍️');
    if (!$('#modal').classList.contains('open')) openDrawer();
    return;
  }

  if (t.dataset.view) return openProduct(t.dataset.view);

  if (t.dataset.cat) {
    state.filter = t.dataset.cat;
    $$('#chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.filter === state.filter));
    $('#shop').scrollIntoView({ behavior: 'smooth' });
    return loadProducts();
  }

  if (t.dataset.filter) {
    state.filter = t.dataset.filter;
    $$('#chips .chip').forEach((c) => c.classList.toggle('active', c === t));
    return loadProducts();
  }

  if (t.dataset.inc) {
    const it = cart.items.find((i) => i.slug === t.dataset.inc);
    return cart.setQty(t.dataset.inc, (it?.qty || 0) + 1);
  }

  if (t.dataset.dec) {
    const it = cart.items.find((i) => i.slug === t.dataset.dec);
    return cart.setQty(t.dataset.dec, (it?.qty || 0) - 1);
  }

  if (t.dataset.del) {
    cart.remove(t.dataset.del);
    return toast('Removed from cart', '🗑️');
  }

  if (t.hasAttribute('data-close')) return closeAll();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAll();
});

/* -------------------------------------------------------------------- boot */
async function boot() {
  initScene($('#bg-canvas'));
  cart.load();

  $('#year').textContent = new Date().getFullYear();

  // Nav behaviour
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  $('#burger').addEventListener('click', () => $('#nav-links').classList.toggle('open'));
  $$('#nav-links a').forEach((a) =>
    a.addEventListener('click', () => $('#nav-links').classList.remove('open')),
  );

  $('#cart-btn').addEventListener('click', openDrawer);
  overlay.addEventListener('click', closeAll);

  // Search + sort
  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    state.search = e.target.value.trim();
    searchTimer = setTimeout(loadProducts, 280);
  });
  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    loadProducts();
  });

  // Cart footer buttons (rendered dynamically)
  $('#cart-foot').addEventListener('click', (e) => {
    if (e.target.id === 'checkout-btn') openCheckout();
    if (e.target.id === 'clear-btn') { cart.clear(); toast('Cart cleared', '🧹'); }
  });

  // Contact form
  $('#contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const msg = $('#contact-msg');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const res = await api('/messages', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      msg.className = 'form-msg ok show';
      msg.textContent = res.message;
      form.reset();
    } catch (err) {
      msg.className = 'form-msg err show';
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // Data
  try {
    const [{ categories }, config, stats] = await Promise.all([
      api('/categories'),
      api('/config'),
      api('/stats'),
    ]);
    state.categories = categories;
    state.config = config;
    renderCategories();

    animateCount($('#stat-products'), stats.products, '+');
    animateCount($('#stat-orders'), Math.max(stats.orders, 0) + 1240, '+');
    animateCount($('#stat-rating'), 49);
    $('#stat-rating').textContent = '4.9';
  } catch (err) {
    toast(err.message, '⚠️');
  }

  await loadProducts();
  cart.paint();
  observeReveals();
}

boot();
