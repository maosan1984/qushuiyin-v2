# v2 Reconfigured (No impact on old site)

The old files are untouched. v2 runs in parallel.

## What changed

- Share text parsing: v2 now auto-extracts the first `http/https` URL from pasted text.
- Key loading: v2 API now auto-loads `.env.v2` at startup.
- Startup scripts: added `dev:v2:web` and `dev:v2:api`.

## Files

- Page: `public/v2.html`
- Frontend logic: `public/v2.js`
- URL parser: `public/v2-url.js`
- API: `server-v2.js`
- Local env: `.env.v2` (ignored by git)
- Env template: `.env.v2.example`

## Run

1. Start single service:
   - `npm.cmd run dev:v2:api`
2. Open:
   - `http://127.0.0.1:3002/v2.html`

Quick start for non-coders:

- Double-click `双击启动网站.cmd` (recommended)
- Open `http://127.0.0.1:3002/v2.html`
- Keep the popped service window open while using
- Double-click `关闭网站.cmd` to stop services

## Notes

- If upstream returns parse failure, try a different fresh share link.
- In the new setup, `3002` serves both page and API.
