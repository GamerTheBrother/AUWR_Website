/**
 * cc26-card.js — renders the FUT-style CC26 player card.
 * Shared by /cc26/ (squad grid) and /cc26/join/ (live preview) so the preview
 * is exactly what gets published. Styles live in cc26-card.css.
 */

const POS_SHORT = { Goalie: 'GK', Back: 'BK', Forward: 'FW' };
const DEFAULT_PHOTO_POS = '50% 22%';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function roleTag(p) {
  const r = (p.role || '').toLowerCase();
  if (r.includes('vice')) return 'VC';
  if (r.includes('captain')) return 'C';
  if (r.includes('coach')) return 'COACH';
  return '';
}

/* Nationality is free text ("Colombian", "New Zealand / British"), so map country
   names and demonyms to ISO codes for flagcdn.com. Unknown text just shows no flag. */
const COUNTRY = {
  nz: ['new zealand', 'nz', 'kiwi', 'aotearoa'], au: ['australia', 'australian', 'aussie'],
  gb: ['united kingdom', 'uk', 'britain', 'great britain', 'british'], 'gb-eng': ['england', 'english'],
  'gb-sct': ['scotland', 'scottish'], 'gb-wls': ['wales', 'welsh'], ie: ['ireland', 'irish'],
  co: ['colombia', 'colombian'], ar: ['argentina', 'argentinian', 'argentine'], cl: ['chile', 'chilean'],
  pe: ['peru', 'peruvian'], ve: ['venezuela', 'venezuelan'], ec: ['ecuador', 'ecuadorian'], uy: ['uruguay', 'uruguayan'],
  br: ['brazil', 'brazilian'], mx: ['mexico', 'mexican'], us: ['usa', 'united states', 'america', 'american'],
  ca: ['canada', 'canadian'], es: ['spain', 'spanish'], pt: ['portugal', 'portuguese'], fr: ['france', 'french'],
  it: ['italy', 'italian'], de: ['germany', 'german'], nl: ['netherlands', 'holland', 'dutch'],
  be: ['belgium', 'belgian'], ch: ['switzerland', 'swiss'], at: ['austria', 'austrian'], dk: ['denmark', 'danish'],
  se: ['sweden', 'swedish'], no: ['norway', 'norwegian'], fi: ['finland', 'finnish'], pl: ['poland', 'polish'],
  hu: ['hungary', 'hungarian'], cz: ['czechia', 'czech republic', 'czech'], tr: ['turkey', 'türkiye', 'turkiye', 'turkish'],
  ru: ['russia', 'russian'], ua: ['ukraine', 'ukrainian'], za: ['south africa', 'south african'],
  jp: ['japan', 'japanese'], cn: ['china', 'chinese'], kr: ['korea', 'south korea', 'korean'], in: ['india', 'indian'],
  ph: ['philippines', 'filipino', 'filipina'], sg: ['singapore', 'singaporean'], my: ['malaysia', 'malaysian'],
  id: ['indonesia', 'indonesian'], fj: ['fiji', 'fijian'], ws: ['samoa', 'samoan'], to: ['tonga', 'tongan'],
};
const NAME_TO_CODE = Object.fromEntries(Object.entries(COUNTRY).flatMap(([code, names]) => names.map(n => [n, code])));

function countryCodes(nationality) {
  const codes = (nationality || '')
    .split(/[\/&,+]| and /i)
    .map(s => NAME_TO_CODE[s.trim().toLowerCase().replace(/[.]/g, '')])
    .filter(Boolean);
  return [...new Set(codes)];
}

function flagsHTML(nationality, max = 2) {
  return countryCodes(nationality).slice(0, max).map(c =>
    `<img class="flag-img" src="https://flagcdn.com/w40/${c}.png" srcset="https://flagcdn.com/w80/${c}.png 2x" alt="${c.toUpperCase()}" width="26" height="17" loading="lazy">`
  ).join('');
}

const displayName = p => p.knownAs || p.lastName;

/**
 * cardHTML(p, { i, index, tag })
 *   i      stagger position for the deal-in animation
 *   index  written to data-index (the squad page uses it to open the profile)
 *   tag    'button' on the squad page, 'div' for the non-interactive form preview
 */
function cardHTML(p, { i = 0, index = '', tag = 'button' } = {}) {
  const role = roleTag(p);
  const initials = (p.firstName?.[0] || '') + (p.lastName?.[0] || '');
  const attrs = tag === 'button'
    ? `data-index="${index}" aria-label="${esc(p.firstName)} ${esc(p.lastName)}, number ${esc(p.number)}"`
    : 'aria-hidden="true"';
  return `
      <${tag} class="card" style="--i:${i}" ${attrs}>
        <div class="card-face">
          ${p.photo
            ? `<img class="card-photo" src="${esc(p.photo)}" alt="" loading="lazy" style="object-position:${photoPos(p)}"><div class="card-shade"></div>`
            : `<div class="card-initials">${esc(initials)}</div>`}
          <div class="card-inner"></div>
          <div class="card-meta">
            <div class="card-num">${esc(p.number)}</div>
            <div class="card-pos">${POS_SHORT[p.position] || esc(p.position)}</div>
            ${role ? `<div class="card-badge">${role}</div>` : ''}
          </div>
          ${countryCodes(p.nationality).length ? `<div class="card-flags">${flagsHTML(p.nationality)}</div>` : ''}
          <div class="card-name"><span class="card-name-text">${esc(displayName(p))}</span></div>
          <div class="card-rule"></div>
          <div class="card-stats">
            <div><b>${p.yearsPlaying}</b><span>YRS</span></div>
            <div><b>${p.tournaments}</b><span>TRN</span></div>
            <div><b>${String(p.joinedYear).slice(-2)}</b><span>EST</span></div>
          </div>
        </div>
      </${tag}>`;
}

/** Photo framing picked in the form ("x% y%"), falling back to the default crop. */
function photoPos(p) {
  return /^\d{1,3}% \d{1,3}%$/.test(p.photoPos || '') ? p.photoPos : DEFAULT_PHOTO_POS;
}
