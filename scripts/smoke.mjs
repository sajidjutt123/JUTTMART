/**
 * Headless smoke test: boots the real index.html + app.js inside jsdom against
 * the live server, then drives the UI (render, filter, add to cart, checkout).
 *
 *   node scripts/smoke.mjs [baseUrl]
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import * as esbuild from 'esbuild';

const BASE = process.argv[2] || 'http://localhost:3000';
const errors = [];
const logs = [];

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(`jsdomError: ${e.message}`));
vc.on('error', (...a) => errors.push(`console.error: ${a.join(' ')}`));
vc.on('warn', (...a) => logs.push(`warn: ${a.join(' ')}`));

// jsdom does not execute <script type="module">, so bundle the real module
// graph into a classic script and inline it. The bundled source is the actual
// app code — only the module wrapper changes.
const bundle = await esbuild.build({
  entryPoints: ['public/js/app.js'],
  bundle: true,
  format: 'iife',
  write: false,
  logLevel: 'silent',
  // three.js needs a real WebGL context; the scene module is stubbed out since
  // the visual layer cannot run headlessly anyway.
  plugins: [{
    name: 'stub-scene',
    setup(build) {
      build.onResolve({ filter: /scene\.js$/ }, () => ({ path: 'scene', namespace: 'stub' }));
      build.onLoad({ filter: /.*/, namespace: 'stub' },
        () => ({ contents: 'export function initScene(){ return { destroy(){} }; }' }));
    },
  }],
});
const appJs = bundle.outputFiles[0].text;

// Drop external <link> tags (Google Fonts) and the module tag; the bundle is
// evaluated after parsing to mirror the deferred execution of real modules.
const html = (await (await fetch(`${BASE}/`)).text())
  .replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g, '')
  .replace(/<script type="module"[^>]*><\/script>/, '');

const dom = new JSDOM(html, {
  url: `${BASE}/`,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole: vc,
  // Polyfills must exist BEFORE any page script executes.
  beforeParse(window) {
    window.fetch = (input, init) => {
      const url = typeof input === 'string' && input.startsWith('/') ? BASE + input : input;
      return fetch(url, init);
    };
    window.matchMedia = () => ({
      matches: false, addEventListener() {}, removeEventListener() {},
    });
    window.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; }
      observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
      unobserve() {} disconnect() {}
    };
    // Force the no-WebGL path so the CSS-only fallback is exercised.
    window.HTMLCanvasElement.prototype.getContext = () => null;
    window.scrollTo = () => {};
    window.Element.prototype.scrollIntoView = () => {};
  },
});

const { window } = dom;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Modules are deferred in browsers: run the bundle once the DOM is parsed.
await wait(120);
window.eval(appJs);
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];

await wait(2500); // let modules load + API calls settle

const results = [];
const check = (name, pass, extra = '') =>
  results.push({ name, pass: !!pass, extra });

check('category cards rendered', $$('#cat-grid .cat-card').length === 3,
      `${$$('#cat-grid .cat-card').length} cards`);
check('filter chips rendered', $$('#chips .chip').length === 4,
      `${$$('#chips .chip').length} chips`);
check('product cards rendered', $$('#product-grid .card').length === 10,
      `${$$('#product-grid .card').length} cards`);
check('no skeletons left', $$('.skeleton').length === 0);
check('footer year filled', /20\d\d/.test($('#year')?.textContent || ''),
      $('#year')?.textContent);
check('hero stats animated', ($('#stat-products')?.textContent || '0') !== '0',
      $('#stat-products')?.textContent);
check('prices formatted', /Rs/.test($('.price')?.textContent || ''),
      $('.price')?.textContent);

// --- filter by category
$$('#chips .chip').find((c) => c.dataset.filter === 'electronics')?.click();
await wait(900);
check('electronics filter', $$('#product-grid .card').length === 4,
      `${$$('#product-grid .card').length} cards`);

// --- add to cart
$('#product-grid .card [data-add]')?.click();
await wait(900);
check('cart badge = 1', $('#cart-count')?.textContent === '1', $('#cart-count')?.textContent);
check('cart drawer opened', $('#drawer')?.classList.contains('open'));
check('cart line rendered', $$('#cart-body .line').length === 1);
check('totals rendered', /Total/.test($('#cart-foot')?.textContent || ''));
check('checkout button exists', !!$('#checkout-btn'));

// --- increment quantity
$('#cart-body [data-inc]')?.click();
await wait(800);
check('qty increment -> 2', $('#cart-count')?.textContent === '2', $('#cart-count')?.textContent);

// --- persistence
check('cart saved to localStorage',
      JSON.parse(window.localStorage.getItem('juttmart.cart.v2') || '[]').length === 1);

// --- quick view modal
$('#product-grid [data-view]')?.click();
await wait(900);
check('product modal opened', $('#modal')?.classList.contains('open'));
check('modal has highlights', $$('#modal-card .hl li').length > 0,
      `${$$('#modal-card .hl li').length} highlights`);
$('#modal-card [data-close]')?.click();
await wait(400);
check('modal closes', !$('#modal')?.classList.contains('open'));

// --- checkout flow
$('#cart-btn')?.click();
await wait(500);
$('#checkout-btn')?.click();
await wait(700);
check('checkout form appears', !!$('#order-form'));

if ($('#order-form')) {
  $('#order-form').querySelector('[name=name]').value = 'Smoke Tester';
  $('#order-form').querySelector('[name=contact]').value = 'smoke@test.com';
  $('#order-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(1400);
  check('order confirmed', /Order confirmed/.test($('#modal-card')?.textContent || ''));
  check('cart cleared after order', $('#cart-count')?.textContent === '0',
        $('#cart-count')?.textContent);
}

// --- contact form
$('#contact-form').querySelector('[name=name]').value = 'Smoke';
$('#contact-form').querySelector('[name=contact]').value = 'smoke@test.com';
$('#contact-form').querySelector('[name=message]').value = 'Testing the contact form';
$('#contact-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(1200);
check('contact form success', $('#contact-msg')?.classList.contains('ok'),
      $('#contact-msg')?.textContent?.slice(0, 40));

// --- XSS guard: ensure escaping helper neutralises markup in rendered cards
check('no raw <script> injected into grid',
      !/<script/i.test($('#product-grid')?.innerHTML || ''));

/* ------------------------------------------------------------------ report */
let failed = 0;
console.log('\n  JUTT MART smoke test\n  ' + '─'.repeat(46));
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.extra ? `  (${r.extra})` : ''}`);
}
console.log('  ' + '─'.repeat(46));
console.log(`  ${results.length - failed}/${results.length} passed`);

if (errors.length) {
  console.log('\n  Console errors:');
  [...new Set(errors)].forEach((e) => console.log('   ⚠️ ' + e.slice(0, 200)));
}

dom.window.close();
process.exit(failed || errors.length ? 1 : 0);
