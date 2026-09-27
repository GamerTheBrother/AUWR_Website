/**
 * profile-form.js
 * ---------------
 * Shared logic for the player profile forms (/team/join/, /cc26/join/).
 * Each page supplies its own markup/styling with these element ids:
 *   #profile-form  #existing  #photo  #photo-preview  #photo-hint
 *   #submit  #status  #done  #turnstile   (+ optional #copy-from)
 *
 *   initProfileForm({
 *     team:       'club' | 'cc26',            // which roster the PR targets
 *     rosterUrl:  '../../data/roster.json',   // players that can be updated
 *     copyFromUrl: '../../data/roster.json',  // optional: prefill source for #copy-from
 *     requirePhoto: true,                     // new players must upload one
 *   });
 */

/* ─── CONFIG ─── set after deploying worker/ (see worker/README.md) */
const SUBMIT_URL = 'https://auwr-roster.gamerthebrother28913.workers.dev/submit';
const TURNSTILE_SITEKEY = ''; // optional; must match TURNSTILE_SECRET on the worker

/* Photos are shown at most ~460px wide (profile panel), so 900px covers 2x screens.
   Quality steps down until the file fits the budget; the worker rejects > 1 MB. */
const PHOTO_MAX_EDGE = 900;
const PHOTO_MIN_EDGE = 500;
const PHOTO_TARGET_BYTES = 180 * 1024;
const PHOTO_QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5];

const PREFILL_FIELDS = ['firstName', 'lastName', 'knownAs', 'nationality', 'number', 'position', 'role',
                        'joinedYear', 'yearsPlaying', 'tournaments', 'favDrill', 'about', 'aboveWater', 'funFact'];

function canvasToBlob(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** Resize + re-encode as JPEG, shrinking quality then size until under budget. */
async function compressPhoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let edge = Math.min(PHOTO_MAX_EDGE, Math.max(bmp.width, bmp.height));
  let best;

  while (true) {
    const scale = edge / Math.max(bmp.width, bmp.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs would turn black in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);

    for (const q of PHOTO_QUALITIES) {
      const blob = await canvasToBlob(canvas, q);
      best = { blob, width: canvas.width, height: canvas.height };
      if (blob.size <= PHOTO_TARGET_BYTES) return { ...best, dataUrl: await blobToDataUrl(blob) };
    }
    if (edge <= PHOTO_MIN_EDGE) break;
    edge = Math.max(PHOTO_MIN_EDGE, Math.round(edge * 0.8));
  }
  return { ...best, dataUrl: await blobToDataUrl(best.blob) };
}

function initProfileForm({ team, rosterUrl, copyFromUrl, requirePhoto = true }) {
  const form      = document.getElementById('profile-form');
  const statusEl  = document.getElementById('status');
  const submitBtn = document.getElementById('submit');
  const existing  = document.getElementById('existing');
  const copyFrom  = document.getElementById('copy-from');
  const photoIn   = document.getElementById('photo');
  const preview   = document.getElementById('photo-preview');
  const photoHint = document.getElementById('photo-hint');
  const photoHintDefault = photoHint.textContent;
  const siteRoot  = new URL('../../', location.href); // join pages live at /<section>/join/

  form.elements.joinedYear.max = new Date().getFullYear();

  let photoDataUrl = null;
  let hasExistingPhoto = false; // current/copied profile already has a photo
  let roster = [];
  let copySource = [];

  function setStatus(msg, kind = '') {
    statusEl.textContent = msg;
    statusEl.className = `status ${kind}`;
  }

  function fillSelect(select, players) {
    players
      .map((p, i) => ({ p, i }))
      .sort((a, b) => a.p.firstName.localeCompare(b.p.firstName))
      .forEach(({ p, i }) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${p.firstName} ${p.lastName} (#${p.number})`;
        select.appendChild(opt);
      });
  }

  const loadJson = url => fetch(url).then(r => (r.ok ? r.json() : [])).catch(() => []);

  loadJson(rosterUrl).then(players => { roster = players; fillSelect(existing, players); });
  if (copyFrom && copyFromUrl) {
    loadJson(copyFromUrl).then(players => { copySource = players; fillSelect(copyFrom, players); });
  }

  /* ─── prefill ─── */
  function resetPhoto() {
    photoDataUrl = null;
    hasExistingPhoto = false;
    photoIn.value = '';
    preview.style.backgroundImage = '';
    preview.classList.remove('has');
    photoHint.textContent = photoHintDefault;
  }

  function prefill(p, photoMsg) {
    const f = form.elements;
    for (const k of PREFILL_FIELDS) if (f[k]) f[k].value = p[k] ?? '';
    f.quote.value = p.rawQuote ?? '';
    resetPhoto();
    if (p.photo) {
      // p.photo is relative to a section page (e.g. ../images/...), one level below the site root
      preview.style.backgroundImage = `url("${new URL(p.photo, new URL('team/', siteRoot)).href}")`;
      preview.classList.add('has');
      hasExistingPhoto = true;
      photoHint.textContent = photoMsg;
    }
    updateCounters();
  }

  existing.addEventListener('change', () => {
    const p = roster[existing.value];
    if (copyFrom) copyFrom.value = '';
    if (!p) { form.reset(); resetPhoto(); updateCounters(); return; }
    prefill(p, 'Current photo shown. Upload a new one only if you want to replace it.');
  });

  copyFrom?.addEventListener('change', () => {
    const p = copySource[copyFrom.value];
    existing.value = '';
    if (!p) { form.reset(); resetPhoto(); updateCounters(); return; }
    prefill(p, 'Your club roster photo will be used. Upload a new one to use a different photo here.');
  });

  /* ─── photo ─── */
  photoIn.addEventListener('change', async () => {
    const file = photoIn.files[0];
    if (!file) return;
    photoHint.textContent = 'Compressing…';
    try {
      const { dataUrl, blob, width, height } = await compressPhoto(file);
      photoDataUrl = dataUrl;
      preview.style.backgroundImage = `url("${dataUrl}")`;
      preview.classList.add('has');
      photoHint.textContent = `${width}×${height}, ${Math.round(blob.size / 1024)} KB (from ${Math.round(file.size / 1024)} KB)`;
    } catch {
      resetPhoto();
      setStatus("Couldn't read that image. Try a JPG or PNG.", 'error');
    }
  });

  /* ─── character counters ─── */
  const counters = [...form.querySelectorAll('[data-counter]')].map(el => {
    const c = document.createElement('span');
    c.className = 'counter';
    el.after(c);
    const update = () => { c.textContent = `${el.value.length} / ${el.maxLength}`; };
    el.addEventListener('input', update);
    return update;
  });
  const updateCounters = () => counters.forEach(fn => fn());
  updateCounters();

  /* ─── optional Turnstile captcha ─── */
  if (TURNSTILE_SITEKEY) {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.onload = () => turnstile.render('#turnstile', { sitekey: TURNSTILE_SITEKEY, theme: 'dark' });
    document.head.appendChild(s);
  }

  /* ─── submit ─── */
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.checkValidity()) {
      const bad = form.querySelector('input:invalid, select:invalid, textarea:invalid');
      const lbl = bad.closest('label');
      bad.focus();
      setStatus(`Please check "${(lbl.querySelector('.req') || lbl.firstChild).textContent.trim()}".`, 'error');
      return;
    }
    if (requirePhoto && !photoDataUrl && !hasExistingPhoto) {
      setStatus('Please add a photo so we can show you on the roster.', 'error');
      photoIn.focus();
      return;
    }

    const { website, ...player } = Object.fromEntries(new FormData(form));
    const payload = { team, player, photo: photoDataUrl, website };
    if (TURNSTILE_SITEKEY) payload.turnstileToken = window.turnstile?.getResponse();

    submitBtn.disabled = true;
    setStatus('Submitting…');
    try {
      const res = await fetch(SUBMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || `Error ${res.status}`);
      form.style.display = 'none';
      document.getElementById('done').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      // fetch() throws TypeError on network/CORS failure; server errors carry their own message
      setStatus(err instanceof TypeError
        ? "Couldn't reach the submission server. Please try again later or contact a club admin."
        : (err.message || 'Something went wrong, please try again.'), 'error');
      if (TURNSTILE_SITEKEY) window.turnstile?.reset();
    } finally {
      submitBtn.disabled = false;
    }
  });
}
