# Roster submission worker

The profile form at `/team/join/` posts to this Cloudflare Worker. For each
submission it opens a pull request that adds or updates
`data/players/<First_Last>.json` and, if a photo was uploaded,
`images/Teamphotos/<First_Last>.jpg`.

- **Approve:** merge the PR. The Pages deploy rebuilds `data/roster.json` and the player shows up on `/team/`.
- **Reject:** close the PR.
- **Fix a typo first:** edit the JSON in the PR's *Files changed* tab, then merge.

Anyone with write access to the repo can approve.

## One-time setup

1. **GitHub token.** Create a fine-grained personal access token
   (GitHub → Settings → Developer settings → Fine-grained tokens):
   - Repository access: only `GamerTheBrother/AUWR_Website`
   - Permissions: **Contents: Read and write**, **Pull requests: Read and write**
     (optional **Issues: Read and write** so PRs get the `roster` label)

2. **Deploy the worker** (needs a free Cloudflare account):

   ```bash
   cd worker
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN     # paste the token
   npx wrangler deploy
   ```

   `wrangler deploy` prints the worker URL, e.g. `https://auwr-roster.<you>.workers.dev`.

3. **Point the form at it.** In `team/join/index.html`, set
   `SUBMIT_URL` to `<worker URL>/submit`, commit, push.

4. *(Recommended)* In the repo's Settings → General, turn on
   **Automatically delete head branches** so merged/closed roster branches clean up.

5. *(Optional, anti-spam)* Create a Cloudflare Turnstile widget for `auwr.co.nz`, then:
   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   ```
   and set `TURNSTILE_SITEKEY` in `team/join/index.html`.

## Local preview of the roster

`data/roster.json` is generated, not committed. To preview `/team/` locally:

```bash
node scripts/build_roster.mjs
```

To test the form against your local site, `http://localhost:3000` is already in
`ALLOWED_ORIGINS` in `wrangler.toml`.
