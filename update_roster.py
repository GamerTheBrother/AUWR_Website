"""
update_roster.py
----------------
Reads the Google Forms CSV export and patches the PLAYERS array
in team/index.html. Run after downloading a fresh CSV.

Usage:
    python update_roster.py
    python update_roster.py path/to/file.csv
"""

import csv
import json
import re
import sys
import os
from pathlib import Path

# ── CONFIG ────────────────────────────────────────────────────────────────────
DEFAULT_CSV = (
    r"C:\Users\rhoyo\Downloads"
    r"\AUWR Player Profile Submission (respuestas) - Respuestas de formulario 1.csv"
)
TEAM_HTML   = Path(__file__).parent / "team" / "index.html"
PHOTOS_DIR  = "../images/photos"   # relative path used inside the HTML

# Column headers (exact strings from Google Forms)
COL = {
    "firstName":   "First Name (Required for the Roster)",
    "lastName":    "Last Name (Required for the Roster)",
    "number":      "Player Number",
    "position":    "Primary Position",
    "role":        "Special Role in the Club (if any)",
    "years":       "Years Playing Underwater Rugby  (e.g., 5)",
    "tournaments": "Number of Tournaments Competed In  (e.g., 3)",
    "joined":      "Year You Joined AUWR (e.g., 2021)",
    "drill":       "Favourite Drill (The one you secretly enjoy the most!)",
    "aboveWater":  "Above Water — What do you do outside the pool? (e.g. Software Developer, Student, Gym Husband, Pilot)",
    "about":       "About You — Write 1-2 sentences in third person describing yourself as a player (Required for your profile bio!)",
    "knownAs":     "Better Known As — Nickname (Optional)",
    "funFact":     "Fun Fact about yourself",
    "quote":       "Your Phrase — One sentence that represents you as a player/teammate",
    "photo":       "Player Photo — Please upload a recent portrait photo of yourself for the website roster.",
}
# ─────────────────────────────────────────────────────────────────────────────


def parse_badges(role: str) -> list:
    role = role.strip().lower()
    if "captain" in role:
        return ["captain"]
    if "coach" in role:
        return ["coach"]
    return []


def photo_path(first: str, last: str) -> str:
    """
    Convention: save player photos as  FirstName_LastName.jpg
    inside images/photos/ before deploying.
    The Google Drive URL from the CSV is ignored for the local path.
    """
    safe = f"{first.strip()}_{last.strip()}.jpg"
    return f"{PHOTOS_DIR}/{safe}"


def safe_int(val: str, fallback: int = 0) -> int:
    try:
        return int(str(val).strip())
    except ValueError:
        return fallback


def wrap_quote(q: str) -> str:
    q = q.strip()
    if not q:
        return ""
    if not q.startswith('"'):
        q = '"' + q
    if not q.endswith('"'):
        q = q + '"'
    return q


def build_players(csv_path: str) -> list:
    players = []
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)

        # Normalise headers: strip leading/trailing whitespace
        reader.fieldnames = [h.strip() for h in reader.fieldnames]

        for row in reader:
            # Skip empty rows
            first = row.get(COL["firstName"], "").strip()
            last  = row.get(COL["lastName"],  "").strip()
            if not first and not last:
                continue

            player = {
                "firstName":   first,
                "lastName":    last,
                "number":      row.get(COL["number"], "0").strip(),
                "position":    row.get(COL["position"], "Forward").strip(),
                "badges":      parse_badges(row.get(COL["role"], "")),
                "photo":       photo_path(first, last),
                "yearsPlaying": safe_int(row.get(COL["years"], "0")),
                "tournaments": safe_int(row.get(COL["tournaments"], "0")),
                "joinedYear":  safe_int(row.get(COL["joined"], "2020")),
                "favDrill":    row.get(COL["drill"], "").strip(),
                "aboveWater":  row.get(COL["aboveWater"], "").strip(),
                "about":       row.get(COL["about"], "").strip(),
                "knownAs":     row.get(COL["knownAs"], "").strip(),
                "funFact":     row.get(COL["funFact"], "").strip(),
                "quote":       wrap_quote(row.get(COL["quote"], "")),
            }
            players.append(player)

    # Sort by jersey number numerically
    players.sort(key=lambda p: safe_int(p["number"], 999))
    return players


def players_to_js(players: list) -> str:
    lines = ["  const PLAYERS = ["]
    for p in players:
        badges_js = json.dumps(p["badges"])
        block = (
            f"    {{\n"
            f"      firstName:   {json.dumps(p['firstName'])},\n"
            f"      lastName:    {json.dumps(p['lastName'])},\n"
            f"      number:      {json.dumps(p['number'])},\n"
            f"      position:    {json.dumps(p['position'])},\n"
            f"      badges:      {badges_js},\n"
            f"      photo:       {json.dumps(p['photo'])},\n"
            f"      yearsPlaying: {p['yearsPlaying']},\n"
            f"      tournaments: {p['tournaments']},\n"
            f"      joinedYear:  {p['joinedYear']},\n"
            f"      favDrill:    {json.dumps(p['favDrill'])},\n"
            f"      aboveWater:  {json.dumps(p['aboveWater'])},\n"
            f"      about:       {json.dumps(p['about'])},\n"
            f"      knownAs:     {json.dumps(p['knownAs'])},\n"
            f"      funFact:     {json.dumps(p['funFact'])},\n"
            f"      quote:       {json.dumps(p['quote'])},\n"
            f"    }},"
        )
        lines.append(block)
    lines.append("  ];")
    return "\n".join(lines)


def patch_html(html_path: Path, new_players_js: str):
    html = html_path.read_text(encoding="utf-8")

    pattern = r"(  const PLAYERS\s*=\s*\[).*?(\];)"
    replacement = new_players_js

    new_html, count = re.subn(pattern, replacement, html, flags=re.DOTALL)
    if count == 0:
        print("ERROR: Could not find PLAYERS array in team/index.html")
        sys.exit(1)

    html_path.write_text(new_html, encoding="utf-8")
    print(f"Patched {html_path} — {count} replacement(s) made.")


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV

    if not os.path.exists(csv_path):
        print(f"ERROR: CSV not found at:\n  {csv_path}")
        print("\nUsage:  python update_roster.py path/to/responses.csv")
        sys.exit(1)

    print(f"Reading: {csv_path}")
    players = build_players(csv_path)

    if not players:
        print("No player rows found in CSV. Nothing updated.")
        sys.exit(0)

    print(f"Found {len(players)} player(s), sorted by jersey number:")
    for p in players:
        badges = ", ".join(p["badges"]) or "—"
        print(f"  #{p['number']:>3}  {p['firstName']} {p['lastName']}  [{badges}]")

    new_js = players_to_js(players)
    patch_html(TEAM_HTML, new_js)
    print("\nDone. Reload team/index.html to see changes.")
    print("\nREMINDER: Save player photos as  FirstName_LastName.jpg")
    print(f"          in  {TEAM_HTML.parent.parent / 'images' / 'photos'}")


if __name__ == "__main__":
    main()
