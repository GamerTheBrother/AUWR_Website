/**
 * AUWR roster submission worker
 * -----------------------------
 * POST /submit  { team: "club" | "cc26", player: {...},
 *                 photo: "data:image/jpeg;base64,..." | null,
 *                 website: "" (honeypot), turnstileToken?: string }
 *
 * Creates a branch with <team dir>/<First_Last>.json (+ optional photo in the
 * team's photo dir) and opens a pull request against main.
 * Merging the PR = approving the profile; the Pages deploy rebuilds the roster JSON.
 *
 * Env (wrangler.toml [vars] / secrets):
 *   GITHUB_TOKEN      secret — fine-grained PAT: Contents RW + Pull requests RW on the repo
 *   GITHUB_REPO       "owner/repo"
 *   BASE_BRANCH       "main"
 *   ALLOWED_ORIGINS   comma-separated, e.g. "https://auwr.co.nz,http://localhost:3000"
 *   TURNSTILE_SECRET  optional secret — if set, a valid Turnstile token is required
 */

const POSITIONS = ['Forward', 'Back', 'Goalie'];
const ROLES = ['', 'Captain', 'Vice Captain', 'Coach'];
// The forms compress photos to ~180 KB; this is only a guard against abuse.
const MAX_PHOTO_BYTES = 1024 * 1024;

// Must match TEAMS in scripts/build_roster.mjs
const TEAMS = {
  club: { label: 'Roster', players: 'data/players',      photos: 'images/Teamphotos' },
  cc26: { label: 'CC26',   players: 'data/cc26/players', photos: 'images/cc26' },
};
const NAME_RE = /^[\p{L}\p{M}' .-]{1,40}$/u;

// field -> [maxLength, required]
const TEXT_FIELDS = {
  favDrill:    [120, false],
  aboveWater:  [160, false],
  about:       [600, true],
  knownAs:     [40,  false],
  funFact:     [300, false],
  quote:       [200, false],
  nationality: [60,  false],
};

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/submit') {
      return json({ error: 'Not found' }, 404, cors);
    }
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400, cors);
    }

    // Honeypot: bots fill every field. Pretend success, do nothing.
    if (body.website) return json({ ok: true }, 200, cors);

    if (env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
      if (!ok) return json({ error: 'Captcha check failed, please retry.' }, 400, cors);
    }

    const team = TEAMS[body.team || 'club'];
    if (!team) return json({ error: 'Unknown team.' }, 400, cors);

    const { player, errors } = validatePlayer(body.player || {});
    if (errors.length) return json({ error: errors.join(' ') }, 400, cors);

    let photoB64 = null;
    if (body.photo) {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.photo);
      if (!m) return json({ error: 'Photo must be a JPEG.' }, 400, cors);
      photoB64 = m[1];
      const bytes = Math.floor(photoB64.length * 3 / 4);
      if (bytes > MAX_PHOTO_BYTES) return json({ error: 'Photo too large (max 1 MB).' }, 400, cors);
      if (!photoB64.startsWith('/9j/')) return json({ error: 'Photo must be a JPEG.' }, 400, cors); // FF D8 FF
    }

    try {
      const pr = await openPullRequest(env, team, player, photoB64);
      return json({ ok: true, pr: pr.number }, 200, cors);
    } catch (e) {
      console.error(e);
      return json({ error: 'Could not submit right now, please try again later.' }, 502, cors);
    }
  },
};

/* ─── validation ─────────────────────────────────────────────────────────── */

function clean(s) {
  return String(s ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
}

function validatePlayer(raw) {
  const errors = [];
  const p = {};

  for (const k of ['firstName', 'lastName']) {
    p[k] = clean(raw[k]).replace(/\s+/g, ' ');
    if (!NAME_RE.test(p[k])) errors.push(`${k === 'firstName' ? 'First' : 'Last'} name is required (letters only).`);
  }

  p.number = clean(raw.number);
  if (!/^\d{1,2}$/.test(p.number)) errors.push('Player number must be 0–99.');

  p.position = clean(raw.position);
  if (!POSITIONS.includes(p.position)) errors.push('Pick a position.');

  p.role = clean(raw.role);
  if (!ROLES.includes(p.role)) p.role = '';

  const year = new Date().getUTCFullYear();
  p.yearsPlaying = intIn(raw.yearsPlaying, 0, 80);
  p.tournaments  = intIn(raw.tournaments, 0, 500);
  p.joinedYear   = intIn(raw.joinedYear, 1970, year) || year;

  for (const [k, [max, required]] of Object.entries(TEXT_FIELDS)) {
    p[k] = clean(raw[k]);
    if (p[k].length > max) errors.push(`${k} is too long (max ${max} characters).`);
    if (required && !p[k]) errors.push(`${k} is required.`);
  }

  // photo framing chosen in the CC26 form preview: "x% y%" (CSS object-position)
  p.photoPos = clean(raw.photoPos);
  if (!/^\d{1,3}% \d{1,3}%$/.test(p.photoPos) || p.photoPos.split(' ').some(v => parseInt(v, 10) > 100)) p.photoPos = '';

  // key order matches existing data/players/*.json files
  const ordered = {
    firstName: p.firstName, lastName: p.lastName, number: p.number, position: p.position,
    role: p.role, yearsPlaying: p.yearsPlaying, tournaments: p.tournaments, joinedYear: p.joinedYear,
    favDrill: p.favDrill, aboveWater: p.aboveWater, about: p.about, knownAs: p.knownAs,
    funFact: p.funFact, quote: p.quote, nationality: p.nationality,
    ...(p.photoPos ? { photoPos: p.photoPos } : {}),
  };
  return { player: ordered, errors };
}

function intIn(v, min, max) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

async function verifyTurnstile(token, secret, ip) {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = await res.json();
  return data.success === true;
}

/* ─── GitHub ─────────────────────────────────────────────────────────────── */

async function openPullRequest(env, team, player, photoB64) {
  const repo = env.GITHUB_REPO;
  const base = env.BASE_BRANCH || 'main';
  const gh = (path, init = {}) => github(env, `/repos/${repo}${path}`, init);

  const slug = `${player.firstName}_${player.lastName}`;
  const jsonPath  = `${team.players}/${slug}.json`;
  const photoPath = `${team.photos}/${slug}.jpg`;

  const baseRef    = await gh(`/git/ref/heads/${base}`);
  const baseSha    = baseRef.object.sha;
  const baseCommit = await gh(`/git/commits/${baseSha}`);

  const existing = await gh(`/contents/${encodePath(jsonPath)}?ref=${base}`, { allow404: true });
  const isUpdate = !!existing;

  const tree = [];
  const jsonBlob = await gh('/git/blobs', {
    method: 'POST',
    body: { content: JSON.stringify(player, null, 2) + '\n', encoding: 'utf-8' },
  });
  tree.push({ path: jsonPath, mode: '100644', type: 'blob', sha: jsonBlob.sha });

  if (photoB64) {
    const photoBlob = await gh('/git/blobs', { method: 'POST', body: { content: photoB64, encoding: 'base64' } });
    tree.push({ path: photoPath, mode: '100644', type: 'blob', sha: photoBlob.sha });
  }

  const newTree = await gh('/git/trees', { method: 'POST', body: { base_tree: baseCommit.tree.sha, tree } });

  const name = `${player.firstName} ${player.lastName}`;
  const verb = isUpdate ? 'Update' : 'Add';
  const commit = await gh('/git/commits', {
    method: 'POST',
    body: {
      message: `${team.label}: ${verb.toLowerCase()} ${name}`,
      tree: newTree.sha,
      parents: [baseSha],
      author: { name: 'AUWR Roster Form', email: 'roster-form@users.noreply.github.com' },
    },
  });

  const branch = `${team.label.toLowerCase()}/${asciiSlug(slug)}-${Date.now().toString(36)}`;
  await gh('/git/refs', { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } });

  const pr = await gh('/pulls', {
    method: 'POST',
    body: {
      title: `${team.label}: ${verb} ${name} (#${player.number})`,
      head: branch,
      base,
      body: prBody(repo, branch, photoPath, team, player, isUpdate, !!photoB64),
    },
  });

  // Label is cosmetic; ignore failures (e.g. token without Issues permission).
  await gh(`/issues/${pr.number}/labels`, { method: 'POST', body: { labels: [team.label.toLowerCase()] } }).catch(() => {});

  return pr;
}

function prBody(repo, branch, photoPath, team, p, isUpdate, hasPhoto) {
  const md = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ') || '—';
  const rows = Object.entries(p).map(([k, v]) => `| ${k} | ${md(v)} |`).join('\n');
  const photo = hasPhoto
    ? `<img src="https://github.com/${repo}/blob/${branch}/${encodePath(photoPath)}?raw=true" width="220">`
    : (isUpdate ? '_No new photo — existing photo kept._'
       : team === TEAMS.cc26 ? "_No photo uploaded — the player's club roster photo is used if there is one._"
       : '⚠️ _No photo uploaded._');

  return [
    `Submitted via the **${team.label}** form (${isUpdate ? '**profile update**' : '**new player**'}).`,
    '',
    photo,
    '',
    '| Field | Value |',
    '|---|---|',
    rows,
    '',
    '---',
    '**Approve:** merge this PR — the site redeploys with the new profile.',
    '**Reject:** close this PR (and delete the branch).',
    '**Fix typos:** edit the JSON in *Files changed* before merging.',
  ].join('\n');
}

async function github(env, path, { method = 'GET', body, allow404 = false } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'auwr-roster-worker',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${method} ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/* ─── helpers ────────────────────────────────────────────────────────────── */

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

function asciiSlug(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player';
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
