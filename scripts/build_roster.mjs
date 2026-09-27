/**
 * build_roster.mjs
 * ----------------
 * Merges each team's per-player JSON files into one roster file the site reads:
 *
 *   data/players/*.json       -> data/roster.json   (club roster, /team/)
 *   data/cc26/players/*.json  -> data/cc26.json     (Champions Cup 2026 squad, /cc26/)
 *
 * Runs automatically in the deploy workflow; run it locally to preview:
 *
 *     node scripts/build_roster.mjs
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// photoDirs: checked in order; CC26 falls back to the player's club photo.
// Photo URLs are relative to the team page (/team/, /cc26/ — both one level deep).
const TEAMS = [
  { id: 'club', players: 'data/players',      photoDirs: ['images/Teamphotos'],               out: 'data/roster.json' },
  { id: 'cc26', players: 'data/cc26/players', photoDirs: ['images/cc26', 'images/Teamphotos'], out: 'data/cc26.json' },
];

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

function buildTeam(team) {
  const dir = join(ROOT, team.players);
  const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort() : [];
  const players = [];
  const seenNumbers = new Map();

  for (const file of files) {
    const slug = file.slice(0, -'.json'.length);
    let p;
    try {
      p = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch (e) {
      console.error(`ERROR: ${team.players}/${file} is not valid JSON — ${e.message}`);
      process.exit(1);
    }

    const number = String(p.number ?? '0').trim();
    if (seenNumbers.has(number)) {
      console.warn(`WARN [${team.id}]: #${number} used by both ${seenNumbers.get(number)} and ${slug}`);
    }
    seenNumbers.set(number, slug);

    const photoDir = team.photoDirs.find(d => existsSync(join(ROOT, d, `${slug}.jpg`)));
    if (!photoDir) console.warn(`WARN [${team.id}]: no photo for ${slug}`);

    players.push({
      firstName:    p.firstName || '',
      lastName:     p.lastName || '',
      number,
      position:     p.position || 'Forward',
      badges:       badges(p.role),
      photo:        photoDir ? `../${photoDir}/${encodeURIComponent(slug)}.jpg` : '',
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
      // raw fields, used by the join forms to prefill profile updates
      role:         p.role || '',
      rawQuote:     p.quote || '',
    });
  }

  players.sort((a, b) => (parseInt(a.number) || 999) - (parseInt(b.number) || 999));
  writeFileSync(join(ROOT, team.out), JSON.stringify(players, null, 2) + '\n');
  console.log(`[${team.id}] wrote ${players.length} players to ${team.out}`);
}

TEAMS.forEach(buildTeam);
