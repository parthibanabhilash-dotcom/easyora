(() => {
  const byId = id => document.getElementById(id);
  let currentSettings = null;
  let viewer = null;
  function node(tag, className, text) { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item; }
  function link(text, href) { const item = node('a', '', text); item.href = href; if (href.startsWith('https:')) { item.target = '_blank'; item.rel = 'noopener noreferrer'; } return item; }
  function contactLinks(settings, container, social = true) {
    container.replaceChildren();
    if (settings.email) container.append(link(settings.email, 'mailto:' + encodeURIComponent(settings.email)));
    if (settings.phone) container.append(link(settings.phone, 'tel:' + settings.phone));
    if (settings.whatsapp) container.append(link('WhatsApp ↗', 'https://wa.me/' + settings.whatsapp.replace(/\D/g, '')));
    if (settings.location) container.append(node('span', 'contact-location', settings.location));
    if (social) {
      const row = node('div', 'public-socials');
      for (const key of ['instagram', 'facebook', 'youtube', 'linkedin']) if (settings[key]) row.append(link(key === 'linkedin' ? 'LinkedIn' : key[0].toUpperCase() + key.slice(1), settings[key]));
      if (row.childNodes.length) container.append(row);
    }
    container.hidden = !container.childNodes.length;
  }
  function briefSharing() {
    const container = byId('brief-share');
    if (!container || !currentSettings) return;
    const value = byId('brief-text')?.value || '';
    container.replaceChildren();
    if (value && currentSettings.email) container.append(link('Email this brief ↗', 'mailto:' + encodeURIComponent(currentSettings.email) + '?subject=' + encodeURIComponent('Project enquiry — EasyOra') + '&body=' + encodeURIComponent(value)));
    if (value && currentSettings.whatsapp) container.append(link('Share on WhatsApp ↗', 'https://wa.me/' + currentSettings.whatsapp.replace(/\D/g, '') + '?text=' + encodeURIComponent(value)));
    container.hidden = !container.childNodes.length;
  }
  function applySettings(settings) {
    currentSettings = settings;
    if (settings.logoUrl) document.querySelectorAll('.brand img, .footer-brand img').forEach(image => { image.src = settings.logoUrl; });
    const direct = byId('public-contact-links');
    if (direct) { contactLinks(settings, direct); byId('public-contact-card').hidden = direct.hidden; }
    const footer = byId('footer-contact-links');
    if (footer && ['email', 'phone', 'whatsapp', 'location', 'instagram', 'facebook', 'youtube', 'linkedin'].some(key => settings[key])) { contactLinks(settings, footer); byId('footer-contact').hidden = footer.hidden; }
    briefSharing();
  }
  function openWork(work, trigger) {
    if (!viewer) {
      viewer = node('dialog', 'work-viewer');
      viewer.setAttribute('aria-label', 'Project gallery');
      document.body.append(viewer);
      viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
      viewer.addEventListener('close', () => { document.documentElement.classList.remove('gallery-open'); if (viewer.returnFocus) viewer.returnFocus.focus(); });
    }
    if (typeof viewer.showModal !== 'function') { window.location.href = work.images[0].url; return; }
    let index = 0;
    viewer.replaceChildren();
    const content = node('div', 'viewer-content');
    const top = node('div', 'viewer-top'); const title = node('h2', '', work.title); title.id = 'viewer-title'; viewer.setAttribute('aria-labelledby', title.id);
    const close = node('button', 'viewer-close', 'Close ×'); close.type = 'button'; close.addEventListener('click', () => viewer.close()); top.append(title, close);
    const image = node('img', 'viewer-image'); image.decoding = 'async';
    const controls = node('div', 'viewer-controls');
    const previous = node('button', '', '← Previous'), next = node('button', '', 'Next →'), position = node('span');
    previous.type = next.type = 'button';
    function update() { image.src = work.images[index].url; image.alt = work.images[index].alt; position.textContent = `${index + 1} / ${work.images.length}`; previous.disabled = index === 0; next.disabled = index === work.images.length - 1; }
    previous.addEventListener('click', () => { if (index > 0) { index--; update(); } }); next.addEventListener('click', () => { if (index < work.images.length - 1) { index++; update(); } });
    controls.append(previous, position, next); controls.hidden = work.images.length === 1;
    const details = node('div', 'viewer-details'); details.append(node('p', 'eyebrow', work.category));
    if (work.client) details.append(node('p', 'viewer-client', work.client));
    if (work.description) details.append(node('p', 'viewer-description', work.description));
    content.append(top, image, controls, details); viewer.append(content); update();
    viewer.onkeydown = event => { if (event.key === 'ArrowRight' && index < work.images.length - 1) { index++; update(); } else if (event.key === 'ArrowLeft' && index > 0) { index--; update(); } };
    viewer.returnFocus = trigger; viewer.showModal(); document.documentElement.classList.add('gallery-open');
  }
  function renderPortfolio(works, container) {
    container.replaceChildren();
    if (!works.length) { container.append(node('p', 'portfolio-empty', 'New work will appear here soon. Have a project in mind? Let’s talk.')); return; }
    works.forEach(work => {
      const card = node('article', 'published-work');
      const open = node('button', 'work-image-button'); open.type = 'button'; open.setAttribute('aria-label', 'View ' + work.title); open.addEventListener('click', () => openWork(work, open));
      const image = node('img'); image.src = work.images[0].url; image.alt = work.images[0].alt; image.loading = 'lazy'; image.decoding = 'async'; image.width = 960; image.height = 720;
      image.addEventListener('error', () => { open.classList.add('image-unavailable'); image.hidden = true; open.append(node('span', '', 'Image temporarily unavailable')); }, { once: true });
      open.append(image, node('span', 'work-image-arrow', '↗'));
      const labels = node('div', 'published-work-label'); labels.append(node('p', 'eyebrow', work.category), node('h3', '', work.title));
      if (work.client) labels.append(node('p', 'work-client', work.client));
      card.append(open, labels); container.append(card);
    });
  }
  const form = byId('brief-form');
  if (form) {
    form.addEventListener('submit', () => queueMicrotask(briefSharing));
    form.addEventListener('input', briefSharing);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  fetch('/api/content', { credentials: 'omit', cache: 'no-store', signal: controller.signal }).then(response => {
    if (!response.ok) throw new Error('Content unavailable'); return response.json();
  }).then(content => {
    applySettings(content.settings);
    const portfolio = byId('published-portfolio'); if (portfolio) renderPortfolio(content.works, portfolio);
    const featured = byId('featured-works');
    if (featured && content.works.length) { featured.hidden = false; renderPortfolio(content.works.slice(0, 3), byId('featured-work-grid')); }
    window.dispatchEvent(new Event('easyora:content-updated'));
  }).catch(() => {
    const portfolio = byId('published-portfolio');
    if (portfolio) { portfolio.replaceChildren(); portfolio.append(node('p', 'portfolio-empty', 'Projects are temporarily unavailable. Please refresh in a moment.')); }
  }).finally(() => clearTimeout(timeout));
})();
