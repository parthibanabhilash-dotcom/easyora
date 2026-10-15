const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const script = fs.readFileSync('dist/assets/motion.js', 'utf8');

function setup({ reduced = false, fine = true, saveData = false, observers = true } = {}) {
  function el() {
    const classes = new Set();
    const properties = new Map();
    return {
      hidden: false, textContent: '', listeners: {}, attributes: {},
      classList: { add: (...items) => items.forEach(x => classes.add(x)), remove: (...items) => items.forEach(x => classes.delete(x)), contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) },
      style: { setProperty: (k, v) => properties.set(k, v), removeProperty: k => properties.delete(k), getPropertyValue: k => properties.get(k) },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      setAttribute(k, v) { this.attributes[k] = v; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 })
    };
  }
  const root = el(), toggle = el(), hero = el(), progress = el(), card = el(), reveal = el(), label = el(), icon = el();
  root.scrollHeight = 2400;
  toggle.querySelector = s => s === '.motion-label' ? label : icon;
  const reducedQuery = { matches: reduced, addEventListener(type, fn) { this.listener = fn; } };
  const fineQuery = { matches: fine, addEventListener(type, fn) { this.listener = fn; } };
  const frames = new Map(), intersections = [], windowEvents = {}, documentEvents = {};
  let next = 0;
  const doc = {
    documentElement: root, hidden: false,
    querySelector: s => ({ '.motion-toggle': toggle, '.hero-visual': hero, '.reading-progress': progress })[s],
    querySelectorAll: s => s === '.will-reveal' ? [reveal].filter(x => x.classList.contains('will-reveal')) : s === '.service-card, .project-card' ? [card] : [reveal],
    addEventListener: (t, fn) => { documentEvents[t] = fn; }
  };
  const win = { scrollY: 400, innerHeight: 800, matchMedia: s => s.includes('reduced-motion') ? reducedQuery : fineQuery, addEventListener: (t, fn) => { windowEvents[t] = fn; } };
  class IntersectionObserver {
    constructor(fn, options) { this.fn = fn; this.options = options; this.nodes = []; intersections.push(this); }
    observe(node) { this.nodes.push(node); }
    unobserve(node) { this.nodes = this.nodes.filter(x => x !== node); }
    disconnect() { this.nodes = []; }
  }
  const context = { document: doc, window: win, navigator: { connection: { saveData } }, requestAnimationFrame: fn => { const id = ++next; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id) };
  if (observers) { win.IntersectionObserver = IntersectionObserver; context.IntersectionObserver = IntersectionObserver; }
  vm.runInNewContext(script, context);
  function flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); }
  return { root, toggle, hero, progress, card, reveal, label, reducedQuery, frames, intersections, doc, documentEvents, windowEvents, flush };
}

const desktop = setup();
assert.equal(desktop.toggle.hidden, false);
desktop.flush();
assert.equal(desktop.progress.style.transform, 'scaleX(0.25)');
desktop.hero.listeners.pointerenter();
desktop.hero.listeners.pointermove({ clientX: 450, clientY: 50 });
desktop.hero.listeners.pointermove({ clientX: 500, clientY: 0 });
assert.equal(desktop.frames.size, 1, 'Pointer moves share a single frame');
desktop.flush();
assert.equal(desktop.hero.style.getPropertyValue('--pointer-y'), '3deg');
assert.equal(desktop.frames.size, 0, 'No perpetual JS animation loop');
desktop.hero.listeners.pointerleave();
assert.equal(desktop.hero.style.getPropertyValue('--pointer-y'), undefined);
const revealObserver = desktop.intersections.find(o => o.options.threshold === 0.06);
revealObserver.fn([{ target: desktop.reveal, isIntersecting: true }]);
assert(desktop.reveal.classList.contains('is-visible'));
assert.equal(revealObserver.nodes.length, 0);
desktop.intersections.find(o => o.options.threshold === 0).fn([{ isIntersecting: false }]);
assert(desktop.root.classList.contains('effects-away'));
desktop.toggle.listeners.click();
assert(desktop.root.classList.contains('motion-paused'));
assert.equal(desktop.toggle.attributes['aria-pressed'], 'true');
assert(!desktop.reveal.classList.contains('will-reveal'));
desktop.hero.listeners.pointermove({ clientX: 1, clientY: 1 });
assert.equal(desktop.frames.size, 0);
desktop.toggle.listeners.click();
assert(!desktop.root.classList.contains('motion-paused'));
desktop.doc.hidden = true;
desktop.documentEvents.visibilitychange();
assert(desktop.root.classList.contains('tab-hidden'));
assert.equal(desktop.frames.size, 0);
desktop.doc.hidden = false;
desktop.documentEvents.visibilitychange();
assert(!desktop.root.classList.contains('tab-hidden'));
desktop.reducedQuery.matches = true;
desktop.reducedQuery.listener();
assert(desktop.root.classList.contains('motion-paused'));
assert.equal(desktop.toggle.hidden, true);

for (const options of [{ reduced: true }, { saveData: true }]) {
  const env = setup(options);
  assert(env.root.classList.contains('motion-paused'));
  assert(!env.reveal.classList.contains('will-reveal'));
  assert.equal(env.frames.size, 0);
}
const mobile = setup({ fine: false });
assert.equal(mobile.hero.listeners.pointermove, undefined);
assert.equal(mobile.card.listeners.pointermove, undefined);
const legacy = setup({ observers: false });
assert(!legacy.reveal.classList.contains('will-reveal'), 'Unsupported observer leaves content visible');
console.log('PASS: 3D pointer bounds and coalescing; no idle JS loop; reveal cleanup; offscreen/tab pause; user pause; reduced motion; data saver; touch-device behavior; observer fallback.');
