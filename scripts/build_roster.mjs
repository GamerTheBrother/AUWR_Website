/**
 * build_roster.mjs
 * ----------------
 * Merges every data/players/*.json into data/roster.json, which team/index.html
 * reads. Runs automatically in the deploy workflow; run it locally to preview:
 *
 *     node scripts/build_roster.mjs
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT        = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAYERS_DIR = join(ROOT, 'data', 'players');
const PHOTOS_DIR  = join(ROOT, 'images', 'Teamphotos');
const OUT         = join(ROOT, 'data', 'roster.json');

function badges(role) {
  const r = (role || '').toLowerCase();
  if (r.includes('captain')) return ['captain'];
  if (r.includes('coach'))   return ['coach'];
  return [];
}

function wrapQuote(q) {
  q = (q || '').trim();
  if (!q) return '';
  if (!q.startsWith('"')) q = '"' + q;
  if (!q.endsWith('"'))   q = q + '"';
  return q;
}

const players = [];
const seenNumbers = new Map();

for (const file of readdirSync(PLAYERS_DIR).filter(f => f.endsWith('.json')).sort()) {
  const slug = file.slice(0, -'.json'.length);
  let p;
  try {
    p = JSON.parse(readFileSync(join(PLAYERS_DIR, file), 'utf8'));
  } catch (e) {
    console.error(`ERROR: ${file} is not valid JSON — ${e.message}`);
    process.exit(1);
  }

  const number = String(p.number ?? '0').trim();
  if (seenNumbers.has(number)) {
    console.warn(`WARN: #${number} used by both ${seenNumbers.get(number)} and ${slug}`);
  }
  seenNumbers.set(number, slug);

  const hasPhoto = existsSync(join(PHOTOS_DIR, `${slug}.jpg`));
  if (!hasPhoto) console.warn(`WARN: no photo for ${slug}`);

  players.push({
    firstName:    p.firstName || '',
    lastName:     p.lastName || '',
    number,
    position:     p.position || 'Forward',
    badges:       badges(p.role),
    photo:        hasPhoto ? `../images/Teamphotos/${encodeURIComponent(slug)}.jpg` : '',
    yearsPlaying: Number(p.yearsPlaying) || 0,
    tournaments:  Number(p.tournaments) || 0,
    joinedYear:   Number(p.joinedYear) || 2020,
    favDrill:     p.favDrill || '',
    aboveWater:   p.aboveWater || '',
    about:        p.about || '',
    knownAs:      p.knownAs || '',
    funFact:      p.funFact || '',
    quote:        wrapQuote(p.quote),
    nationality:  p.nationality || '',
    // raw fields, used by team/join/ to prefill profile updates
    role:         p.role || '',
    rawQuote:     p.quote || '',
  });
}

players.sort((a, b) => (parseInt(a.number) || 999) - (parseInt(b.number) || 999));
writeFileSync(OUT, JSON.stringify(players, null, 2) + '\n');
console.log(`Wrote ${players.length} players to data/roster.json`);
