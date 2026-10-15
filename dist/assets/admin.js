(() => {
  const $ = id => document.getElementById(id);
  const state = { csrf: '', content: null, images: [], logoId: null, dirty: false, busy: false, configured: false, reauth: false };
  function message(text, error = false) { $('admin-status').textContent = text; $('admin-status').classList.toggle('error', error); }
  function dirty(value = true) { state.dirty = value; }
  function busy(value) {
    state.busy = value;
    document.querySelectorAll('button').forEach(button => { button.disabled = value; });
    document.querySelectorAll('input[type=file]').forEach(input => { input.disabled = value; });
    $('login-submit').disabled = value || !state.configured;
  }
  async function api(data) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch('/api/admin', { method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: data ? { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf } : {}, ...(data ? { body: JSON.stringify(data) } : {}), signal: controller.signal });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401 && data && data.action !== 'login') { state.reauth = true; $('login-panel').hidden = false; $('dashboard').hidden = true; $('logout').hidden = true; }
        throw new Error(result.error || 'Something went wrong. Please try again.');
      }
      return result;
    } catch (error) { if (error.name === 'AbortError') throw new Error('This request took too long. Reload the latest content before retrying a save.'); throw error; }
    finally { clearTimeout(timer); }
  }
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function button(text, handler, className = 'quiet') { const node = element('button', className, text); node.type = 'button'; node.addEventListener('click', handler); return node; }
  function allowDiscard() { return !state.dirty || window.confirm('Discard your unsaved changes?'); }
  function showTab(name) {
    $('works-panel').hidden = name !== 'works'; $('settings-panel').hidden = name !== 'settings';
    document.querySelectorAll('[data-tab]').forEach(node => { if (node.dataset.tab === name) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current'); });
  }
  function renderWorks() {
    const list = $('work-list'); list.replaceChildren();
    const works = [...state.content.works].sort((a, b) => a.order - b.order || b.createdAt.localeCompare(a.createdAt));
    $('project-count').textContent = `${works.length} project${works.length === 1 ? '' : 's'} · ${works.filter(work => work.published).length} published`;
    if (!works.length) { const empty = element('div', 'empty-state'); empty.append(element('h3', '', 'Your work belongs here.'), element('p', '', 'Add a project and a few images to get started.')); list.append(empty); }
    works.forEach(work => {
      const card = element('article', 'admin-project');
      const image = element('img'); image.src = `/api/media?id=${work.images[0].id}`; image.alt = work.images[0].alt; image.loading = 'lazy';
      const content = element('div', 'admin-project-content');
      content.append(element('span', 'project-badge' + (work.published ? '' : ' draft'), work.published ? 'Published' : 'Draft'), element('h3', '', work.title), element('p', '', work.category));
      const actions = element('div', 'project-actions');
      actions.append(button('Edit', () => { if (allowDiscard()) editWork(work); }), button(work.published ? 'Unpublish' : 'Publish', () => update({ action: 'save-work', work: { ...work, published: !work.published } }, work.published ? 'Project unpublished.' : 'Project published.')),
        button('Remove', () => { if (window.confirm(`Remove “${work.title}” from your portfolio?`)) update({ action: 'delete-work', id: work.id }, 'Project removed.'); }, 'quiet danger'));
      content.append(actions); card.append(image, content); list.append(card);
    });
  }
  function fillSettings() {
    const settings = state.content.settings;
    for (const key of ['email', 'phone', 'whatsapp', 'location', 'instagram', 'facebook', 'youtube', 'linkedin']) $('settings-form').elements.namedItem(key).value = settings[key] || '';
    state.logoId = settings.logoId;
    $('logo-preview').src = state.logoId ? `/api/media?id=${state.logoId}` : '/assets/easyora-logo.webp';
  }
  function signedIn(result) {
    state.csrf = result.csrfToken; state.content = result.content;
    $('login-panel').hidden = true; $('dashboard').hidden = false; $('logout').hidden = false;
    $('login-form').reset();
    if (state.reauth) { state.reauth = false; renderWorks(); message('Signed in again. Your unsaved changes are still here; review them before saving.'); return; }
    $('editor-panel').hidden = true; $('work-list').hidden = false; showTab('works'); renderWorks(); fillSettings(); dirty(false); message('');
  }
  function renderImages() {
    const list = $('image-list'); list.replaceChildren();
    state.images.forEach((item, index) => {
      const card = element('div', 'image-editor'); const image = element('img'); image.src = `/api/media?id=${item.id}`; image.alt = item.alt || 'Uploaded project image';
      const label = element('label', '', 'Image description'); const input = element('input'); input.value = item.alt || ''; input.maxLength = 180; input.setAttribute('aria-label', `Description for image ${index + 1}`); input.addEventListener('input', () => { item.alt = input.value; dirty(); }); label.append(input);
      const actions = element('div');
      if (index > 0) actions.append(button('Make cover', () => { state.images.splice(index, 1); state.images.unshift(item); dirty(); renderImages(); }));
      actions.append(button('Remove', () => { state.images.splice(index, 1); dirty(); renderImages(); }, 'quiet danger'));
      card.append(image, element('span', 'cover-label', index === 0 ? 'Cover image' : `Image ${index + 1}`), label, actions); list.append(card);
    });
  }
  function editWork(work = null) {
    const form = $('work-form'); form.reset();
    for (const key of ['id', 'title', 'category', 'description', 'client', 'order']) if (work) form.elements.namedItem(key).value = work[key] ?? '';
    form.elements.namedItem('published').checked = Boolean(work?.published);
    state.images = work ? structuredClone(work.images) : [];
    $('editor-title').textContent = work ? 'Edit project' : 'New project';
    $('editor-panel').hidden = false; $('work-list').hidden = true; renderImages(); dirty(false); $('editor-panel').scrollIntoView({ behavior: 'auto', block: 'start' }); form.elements.namedItem('title').focus();
  }
  async function update(data, success) {
    if (state.busy) return;
    busy(true); message('Saving…');
    try { const result = await api({ ...data, revision: state.content.revision }); state.content = result.content; renderWorks(); dirty(false); message(success); return true; }
    catch (error) { message(error.message, true); return false; }
    finally { busy(false); }
  }
  async function optimize(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15_000_000) throw new Error('Choose a JPG, PNG, or WebP image under 15 MB.');
    let bitmap;
    if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(file);
    else {
      const source = URL.createObjectURL(file);
      try { bitmap = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight, source: image, close() { URL.revokeObjectURL(source); } }); image.onerror = () => reject(new Error('Could not read this image. Try another JPG, PNG, or WebP.')); image.src = source; }); }
      catch (error) { URL.revokeObjectURL(source); throw error; }
    }
    try {
      if (bitmap.width * bitmap.height > 25_000_000) throw new Error('This image has a very high resolution. Resize it below 25 megapixels first.');
      let width = Math.min(1800, bitmap.width), height = Math.round(bitmap.height * width / bitmap.width);
      if (height > 1800) { width = Math.round(width * 1800 / height); height = 1800; }
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is unavailable in this browser.');
      context.drawImage(bitmap.source || bitmap, 0, 0, width, height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
      if (!blob || blob.size > 2_000_000) throw new Error('This image is still too large. Try a smaller version.');
      return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not read the image.')); reader.readAsDataURL(blob); });
    } finally { bitmap.close(); }
  }
  async function upload(file) { return api({ action: 'upload', data: await optimize(file) }); }

  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); if (state.busy || !state.configured) return;
    busy(true); message('Signing in…');
    try { const data = new FormData(event.target); signedIn(await api({ action: 'login', email: data.get('email'), password: data.get('password') })); }
    catch (error) { message(error.message, true); }
    finally { busy(false); }
  });
  $('logout').addEventListener('click', async () => {
    if (!allowDiscard()) return; busy(true);
    try { await api({ action: 'logout' }); state.content = null; state.csrf = ''; dirty(false); $('dashboard').hidden = true; $('logout').hidden = true; $('login-panel').hidden = false; $('work-form').reset(); $('settings-form').reset(); $('image-list').replaceChildren(); $('work-list').replaceChildren(); state.images = []; message('Signed out.'); }
    catch (error) { message(error.message, true); } finally { busy(false); }
  });
  document.querySelectorAll('[data-tab]').forEach(node => node.addEventListener('click', () => { if (!allowDiscard()) return; dirty(false); $('editor-panel').hidden = true; $('work-list').hidden = false; fillSettings(); showTab(node.dataset.tab); }));
  $('new-work').addEventListener('click', () => { if (allowDiscard()) editWork(); });
  $('cancel-edit').addEventListener('click', () => { if (allowDiscard()) { $('editor-panel').hidden = true; $('work-list').hidden = false; state.images = []; dirty(false); } });
  $('work-form').addEventListener('input', () => dirty());
  async function saveWork(asDraft = false) {
    const form = $('work-form'); if (!form.reportValidity()) return;
    if (!state.images.length) { message('Add at least one project image.', true); return; }
    const data = new FormData(form);
    const work = { id: data.get('id') || undefined, title: data.get('title'), category: data.get('category'), description: data.get('description'), client: data.get('client'), order: Number(data.get('order')), published: !asDraft && form.elements.namedItem('published').checked, images: state.images };
    if (await update({ action: 'save-work', work }, work.published ? 'Project saved and published on your website.' : 'Draft saved. It is not visible on your website.')) { $('editor-panel').hidden = true; $('work-list').hidden = false; state.images = []; }
  }
  $('work-form').addEventListener('submit', event => { event.preventDefault(); saveWork(); });
  $('save-draft').addEventListener('click', () => saveWork(true));
  $('project-images').addEventListener('change', async event => {
    const files = [...event.target.files]; if (!files.length) return;
    if (state.images.length + files.length > 8) { message('A project can have up to 8 images.', true); event.target.value = ''; return; }
    busy(true);
    try { for (let i = 0; i < files.length; i++) { message(`Optimizing and uploading image ${i + 1} of ${files.length}…`); const result = await upload(files[i]); state.images.push({ id: result.id, alt: '' }); dirty(); renderImages(); } message('Images uploaded. Save the project when you’re ready.'); }
    catch (error) { message(error.message, true); }
    finally { busy(false); event.target.value = ''; }
  });
  $('settings-form').addEventListener('input', () => dirty());
  $('logo-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return; busy(true); message('Optimizing your logo…');
    try { const result = await upload(file); state.logoId = result.id; $('logo-preview').src = result.previewUrl; dirty(); message('Logo uploaded. Save contact & logo to make it live.'); }
    catch (error) { message(error.message, true); }
    finally { busy(false); event.target.value = ''; }
  });
  $('reset-logo').addEventListener('click', () => { state.logoId = null; $('logo-preview').src = '/assets/easyora-logo.webp'; dirty(); message('Original logo selected. Save to apply it.'); });
  $('settings-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.target), settings = { logoId: state.logoId };
    for (const key of ['email', 'phone', 'whatsapp', 'location', 'instagram', 'facebook', 'youtube', 'linkedin']) settings[key] = form.get(key);
    await update({ action: 'save-settings', settings }, 'Contact details and logo saved. Your website is up to date.');
  });
  window.addEventListener('beforeunload', event => { if (state.dirty || state.busy) { event.preventDefault(); event.returnValue = ''; } });
  api().then(result => { state.configured = result.configured; $('setup-message').hidden = result.configured; if (result.authenticated) signedIn(result); else message(result.configured ? '' : 'Admin setup is required before you can sign in.'); }).catch(error => message(error.message, true)).finally(() => busy(false));
})();
