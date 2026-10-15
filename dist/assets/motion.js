/* No animation runtime: CSS does the continuous work; JS responds to input only. */
(() => {
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  const toggle = document.querySelector('.motion-toggle');
  const hero = document.querySelector('.hero-visual');
  const progress = document.querySelector('.reading-progress');
  let pausedByUser = false;
  let active = false;
  let revealObserver;
  let heroObserver;
  let scrollFrame = 0;
  let scrollRange = 1;
  const tiltStates = [];

  function clearTilt(state) {
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = 0;
    state.rect = null;
    ['--tilt-x', '--tilt-y', '--spot-x', '--spot-y', '--pointer-x', '--pointer-y'].forEach(name => state.node.style.removeProperty(name));
  }

  function updateProgress() {
    scrollFrame = 0;
    if (!active || document.hidden) return;
    if (progress) progress.style.transform = `scaleX(${Math.max(0, Math.min(1, window.scrollY / scrollRange))})`;
  }

  function onScroll() {
    if (!active || document.hidden) return;
    tiltStates.forEach(state => { state.rect = null; });
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateProgress);
  }

  function measure() {
    scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    onScroll();
  }

  function revealContent() {
    if (revealObserver) revealObserver.disconnect();
    document.querySelectorAll('.will-reveal').forEach(node => node.classList.remove('will-reveal'));
  }

  function observeReveals() {
    if (!('IntersectionObserver' in window)) return;
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.06 });
    // Only small groups reveal. Long articles and whole sections stay visible.
    document.querySelectorAll('.section-head, .service-cards, .project-card, .process-grid, .values-grid, .insight-card, .cta, .service-row, .panel').forEach(node => {
      if (!node.classList.contains('is-visible')) {
        node.classList.add('will-reveal');
        revealObserver.observe(node);
      }
    });
  }

  function configureMotion() {
    active = !reduced.matches && !pausedByUser && !saveData;
    root.classList.toggle('motion-paused', !active);
    root.classList.add('motion-ready');
    tiltStates.forEach(clearTilt);
    if (toggle) {
      toggle.hidden = reduced.matches || saveData;
      toggle.setAttribute('aria-pressed', String(pausedByUser));
      toggle.querySelector('.motion-label').textContent = active ? 'Pause motion' : 'Enable motion';
      toggle.querySelector('.motion-icon').textContent = active ? 'Ⅱ' : '▷';
    }
    if (active) observeReveals();
    else {
      revealContent();
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
    }
    measure();
  }

  function attachTilt(node, isHero) {
    const state = { node, frame: 0, rect: null, x: 0, y: 0 };
    tiltStates.push(state);
    node.addEventListener('pointerenter', () => {
      if (active && finePointer.matches) state.rect = node.getBoundingClientRect();
    }, { passive: true });
    node.addEventListener('pointermove', event => {
      if (!active || !finePointer.matches || document.hidden) return;
      state.x = event.clientX;
      state.y = event.clientY;
      if (state.frame) return;
      state.frame = requestAnimationFrame(() => {
        state.frame = 0;
        if (!active || !finePointer.matches || document.hidden) return;
        const rect = state.rect || (state.rect = node.getBoundingClientRect());
        const x = Math.max(0, Math.min(1, (state.x - rect.left) / Math.max(1, rect.width)));
        const y = Math.max(0, Math.min(1, (state.y - rect.top) / Math.max(1, rect.height)));
        const strength = isHero ? 6 : 3;
        node.style.setProperty(isHero ? '--pointer-x' : '--tilt-x', `${(0.5 - y) * strength}deg`);
        node.style.setProperty(isHero ? '--pointer-y' : '--tilt-y', `${(x - 0.5) * strength}deg`);
        if (!isHero) {
          node.style.setProperty('--spot-x', `${x * 100}%`);
          node.style.setProperty('--spot-y', `${y * 100}%`);
        }
      });
    }, { passive: true });
    node.addEventListener('pointerleave', () => clearTilt(state), { passive: true });
    node.addEventListener('pointercancel', () => clearTilt(state), { passive: true });
  }

  // Touch devices receive no per-card pointer handlers.
  function configurePointer() {
    tiltStates.forEach(clearTilt);
    if (!finePointer.matches || saveData) return;
    if (hero && !tiltStates.some(state => state.node === hero)) attachTilt(hero, true);
    document.querySelectorAll('.service-card, .project-card').forEach(node => {
      if (!tiltStates.some(state => state.node === node)) attachTilt(node, false);
    });
  }

  if (toggle) toggle.addEventListener('click', () => { pausedByUser = !pausedByUser; configureMotion(); });
  reduced.addEventListener('change', configureMotion);
  finePointer.addEventListener('change', configurePointer);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('easyora:content-updated', measure);
  document.addEventListener('visibilitychange', () => {
    root.classList.toggle('tab-hidden', document.hidden);
    if (document.hidden) {
      tiltStates.forEach(clearTilt);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
    } else measure();
  });
  if (hero && 'IntersectionObserver' in window) {
    heroObserver = new IntersectionObserver(entries => {
      root.classList.toggle('effects-away', !entries[0].isIntersecting);
    }, { threshold: 0 });
    heroObserver.observe(hero);
  }
  root.classList.toggle('tab-hidden', document.hidden);
  configureMotion();
  configurePointer();
  if (document.fonts) document.fonts.ready.then(measure);
  window.addEventListener('pagehide', () => {
    root.classList.add('tab-hidden');
    tiltStates.forEach(clearTilt);
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
  });
  window.addEventListener('pageshow', () => { root.classList.toggle('tab-hidden', document.hidden); measure(); });
})();
