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

const RIOT_ID_MESSAGE = 'Riot IDは「GameName#Tagline」の形式で入力してください。GameNameは英数字3〜16文字、Taglineは英数字3〜5文字です。例：Player123#JP1';
const RIOT_ID_PATTERN = /^[A-Za-z0-9]{3,16}#[A-Za-z0-9]{3,5}$/;

function normalizeRiotId(value) {
  const raw = String(value || '').trim().replace(/＃/g, '#');
  let normalized = '';
  let hasHash = false;
  for (const char of raw) {
    if (/^[A-Za-z0-9]$/.test(char)) {
      normalized += char;
      continue;
    }
    if (char === '#' && !hasHash) {
      normalized += '#';
      hasHash = true;
    }
  }
  const [gameName = '', tagline = ''] = normalized.split('#');
  const limitedGameName = gameName.slice(0, 16);
  const limitedTagline = tagline.slice(0, 5);
  return hasHash ? `${limitedGameName}#${limitedTagline}` : limitedGameName;
}

function isRiotIdInput(input) {
  if (!(input instanceof HTMLInputElement)) return false;
  return input.placeholder === '例：name#JP1' || input.getAttribute('data-riot-id') === 'true';
}

function validateRiotIdInput(input) {
  if (!isRiotIdInput(input)) return;
  const value = input.value.trim();
  if (!value || RIOT_ID_PATTERN.test(value)) {
    input.setCustomValidity('');
    return;
  }
  input.setCustomValidity(RIOT_ID_MESSAGE);
}

function ensureRiotIdHint(input) {
  if (!isRiotIdInput(input) || input.dataset.riotHintReady === 'true') return;
  input.dataset.riotHintReady = 'true';
  input.setAttribute('inputmode', 'text');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('maxlength', '22');
  input.setAttribute('title', RIOT_ID_MESSAGE);
  input.setAttribute('aria-describedby', 'riot-id-help');

  const label = input.closest('label');
  if (!label || label.querySelector('#riot-id-help')) return;
  const hint = document.createElement('small');
  hint.id = 'riot-id-help';
  hint.className = 'riot-id-help';
  hint.textContent = '例：Player123#JP1（英数字のみ / GameName 3〜16文字、Tagline 3〜5文字）';
  label.appendChild(hint);
}

document.addEventListener('input', (event) => {
  const input = event.target;
  if (!isRiotIdInput(input)) return;
  const normalized = normalizeRiotId(input.value);
  if (input.value !== normalized) input.value = normalized;
  validateRiotIdInput(input);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, true);

document.addEventListener('invalid', (event) => {
  validateRiotIdInput(event.target);
}, true);

document.addEventListener('focusin', (event) => {
  if (!isRiotIdInput(event.target)) return;
  ensureRiotIdHint(event.target);
  validateRiotIdInput(event.target);
}, true);

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const input = form.querySelector('input[placeholder="例：name#JP1"], input[data-riot-id="true"]');
  if (!input) return;
  ensureRiotIdHint(input);
  validateRiotIdInput(input);
  if (!input.checkValidity()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    input.reportValidity();
  }
}, true);

window.requestAnimationFrame(() => {
  document.querySelectorAll('input[placeholder="例：name#JP1"], input[data-riot-id="true"]').forEach((input) => {
    ensureRiotIdHint(input);
    validateRiotIdInput(input);
  });
});
