# Cloudflare Worker Backend — Quote Email + PDF

Exposes:
- POST /quote

It will:
1) fetch the store config from your website (`STORE_CONFIG_BASE_URL/<store>/config/site_config.json`)
2) validate SKUs + prices from that config
3) generate a quote number
4) generate a PDF (pdf-lib)
5) email the quote + PDF to:
   - the customer
   - the owner email (OWNER_EMAIL)

---

## Setup

```bash
cd backend/cloudflare-worker
npm install
npm i -g wrangler
wrangler login
```

Edit `wrangler.toml`:
- `STORE_CONFIG_BASE_URL`:
  - Default GitHub Pages: `https://USERNAME.github.io/REPO`
  - Custom domain: `https://yourdomain.com`
- `EMAIL_FROM`:
  - MVP: `Commerce Hub <onboarding@resend.dev>`
  - Production: use your verified domain

Set secrets:
```bash
wrangler secret put RESEND_API_KEY
wrangler secret put OWNER_EMAIL
```

Deploy:
```bash
wrangler deploy
```

After deploy, copy the Worker URL and paste into:
- root `commercehub.config.json` → `backend.quote_api_url`

Then redeploy the site:
```bash
cd ../../
npm run deploy
```
