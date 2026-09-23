# ycp-workshop-worker

Cloudflare Worker that proxies AI calls for the `/workshop/` tool. The
frontend never talks to Anthropic directly (that would expose the API key in
the browser); it always calls this Worker, which holds the key as a secret.

## Deploy (one-time)

You need a Cloudflare account and an Anthropic API key. Run these yourself —
this is your account and your billing, so it isn't something to hand off.

```bash
cd workshop-worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put WORKSHOP_ACCESS_KEY
npx wrangler deploy
```

- `ANTHROPIC_API_KEY`: from console.anthropic.com. Billing is pay-as-you-go;
  a full 60–90 min workshop for one participant is on the order of a few
  Norwegian kroner in API cost with `claude-opus-5` (switch `MODEL` in
  `src/index.js` to `claude-sonnet-5` if you want it cheaper — noticeably
  less expensive, still good quality for this kind of structured work).
- `WORKSHOP_ACCESS_KEY`: any code you make up (e.g. `ycp-sept-workshop`).
  Tell it to participants verbally or show it on screen at the start of the
  session. It is not real security, just a cheap gate so the tool's URL
  can't be found and abused by a stranger outside a live session, draining
  your API budget.

`wrangler deploy` prints the Worker's URL
(`https://ycp-workshop-worker.<your-subdomain>.workers.dev`). Paste that into
`WORKER_URL` at the top of `../workshop/app.js`.

## Updating allowed origins

If the site's domain changes, update `ALLOWED_ORIGINS` in `wrangler.toml`
and redeploy.

## Local testing

```bash
npm run dev
```

Runs the Worker on `http://localhost:8787`. Point `WORKER_URL` in
`app.js` there while testing, then switch it back before deploying the
frontend.
