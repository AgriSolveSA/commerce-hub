# QUICKSTART (Frontend + Backend)

## Frontend (already built in /public)
**Do not open the HTML files by double-clicking** (file://). The app fetches config via `fetch()` and browsers block that on file://.

### Windows (easy)
Double-click: `start-local.bat`
Then open:
- http://localhost:8080/

### Mac/Linux
In terminal:
```bash
bash start-local.sh
```
Then open:
- http://localhost:8080/

## Deploy frontend (GitHub Pages)
From project root:
```bash
npm install
npm run deploy
```

## Backend (Cloudflare Worker)
Folder: `backend/cloudflare-worker`

```bash
cd backend/cloudflare-worker
npm install
npm i -g wrangler
wrangler login
wrangler secret put RESEND_API_KEY
wrangler secret put OWNER_EMAIL
wrangler deploy
```

Copy the deployed Worker URL into:
- `commercehub.config.json` → `backend.quote_api_url`
Then run:
```bash
npm run deploy
```
