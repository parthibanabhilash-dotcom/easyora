const menu = document.querySelector('.menu-toggle');
const navigation = document.getElementById('navigation');
function closeMenu() { menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open navigation'); navigation.classList.remove('open'); }
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  navigation.classList.toggle('open', open);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
document.addEventListener('click', e => { if (!e.target.closest('header')) closeMenu(); });
window.matchMedia('(min-width: 901px)').addEventListener('change', e => { if(e.matches) closeMenu(); });
const form = document.getElementById('brief-form');
if (form) {
  const status = document.getElementById('brief-status');
  const output = document.getElementById('brief-output');
  const text = document.getElementById('brief-text');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const fields = [['Name', 'name'], ['Email', 'email'], ['Project type', 'project'], ['Estimated budget (not a quote)', 'budget'], ['Timeline', 'timeline'], ['Goals', 'goals']];
    if (!String(data.get('name')).trim() || String(data.get('goals')).trim().length < 20) { status.textContent = 'Please add your name and at least 20 characters describing your goals.'; return; }
    text.value = 'EASYORA — PROJECT BRIEF\n\n' + fields.map(([label, key]) => label + ': ' + String(data.get(key)).trim()).join('\n\n');
    output.hidden = false;
    try {
      await navigator.clipboard.writeText(text.value);
      status.textContent = 'Project brief copied. Nothing has been sent. You can paste it wherever you choose.';
    } catch {
      status.textContent = 'Automatic copying is unavailable. Select and copy your brief below. Nothing has been sent.';
      text.focus(); text.select();
    }
  });
  document.getElementById('select-brief').addEventListener('click', () => { text.focus(); text.select(); text.setSelectionRange(0, text.value.length); status.textContent = 'Brief selected. Use your device’s copy command. Nothing has been sent.'; });
  form.addEventListener('input', () => { output.hidden = true; text.value = ''; status.textContent = ''; });
}
