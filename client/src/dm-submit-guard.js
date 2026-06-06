// Extra guard for rapid Enter/click double-submit before React state finishes updating.
// React's dmSending still controls the normal UI; this only blocks very short duplicate submits.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.classList.contains('dm-form')) return;

  const input = form.querySelector('input');
  const body = String(input?.value || '').trim();
  if (!body) return;

  const now = Date.now();
  const lastAt = Number(form.dataset.lastSubmitAt || 0);
  const lastBody = form.dataset.lastSubmitBody || '';

  if (form.dataset.sending === 'true' || (lastBody === body && now - lastAt < 2500)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  form.dataset.sending = 'true';
  form.dataset.lastSubmitAt = String(now);
  form.dataset.lastSubmitBody = body;
  window.setTimeout(() => {
    form.dataset.sending = 'false';
  }, 2500);
}, true);
