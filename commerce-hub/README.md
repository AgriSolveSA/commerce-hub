# Commerce Hub (4 stores, 1 domain) — One Config, One Deploy

This repo creates a multi-store static website (GitHub Pages) and a tiny backend (Cloudflare Worker) that:
- generates a quote number,
- generates a PDF quote,
- emails the quote to the customer AND to you.

You edit ONE file: `commercehub.config.json`
Then run ONE command: `npm run deploy`

---

## What you get

- One repo
- Multiple stores under paths:
  - /cubclub/
  - /honey/
  - /toys/
  - /tools/
- One config file controls:
  - store names
  - WhatsApp + support email
  - products + prices
  - backend quote URL
  - optional custom domain (so stores become true root paths: /cubclub not /repo/cubclub)

---

## Important URL reality (GitHub Pages)

There are two modes:

### Mode A: Default GitHub Pages URL (no custom domain)
Your site is:
- https://USERNAME.github.io/REPO/

Stores become:
- https://USERNAME.github.io/REPO/cubclub/
- https://USERNAME.github.io/REPO/honey/

### Mode B: Custom domain (true root paths)
Your site is:
- https://yourdomain.com/

Stores become true root paths:
- https://yourdomain.com/cubclub/
- https://yourdomain.com/honey/

This repo supports Mode B by generating a `public/CNAME` file automatically (from config).

---

## 1) One-time setup

Install:
- Git
- Node.js (LTS)

Get the repo onto your PC and install dependencies:

```bash
git clone <YOUR_REPO_URL>
cd commerce-hub
npm install
```

---

## 2) Configure your stores (ONE FILE)

Edit:
- `commercehub.config.json`

Set:
- your WhatsApp link
- support email
- products + prices
- backend quote URL (after you deploy the Worker)

---

## 3) Build + Preview locally

Build into `public/`:

```bash
npm run build
```

Preview it:

```bash
npx serve public
```

Or:

```bash
cd public
python -m http.server 8080
```

---

## 4) Deploy to GitHub Pages (ONE COMMAND)

```bash
npm run deploy
```

Then in GitHub:
- Repo → Settings → Pages
- Source: Deploy from a branch
- Branch: `gh-pages` / `(root)`

Your website is live.

---

## 5) Custom domain (so your stores become /cubclub, /honey, etc.)

In `commercehub.config.json`, set:

```json
"custom_domain": "yourdomain.com"
```

Then deploy again:

```bash
npm run deploy
```

GitHub settings:
- Repo → Settings → Pages → Custom domain
- Enter `yourdomain.com`

DNS:
- Do the DNS records your GitHub Pages screen shows (depends on your domain host)

---

## 6) Backend (Cloudflare Worker) — required for email + PDF quotes

GitHub Pages is static (no server). Quotes must be emailed by the backend.

Backend folder:
- `backend/cloudflare-worker`

### Backend quick start

```bash
cd backend/cloudflare-worker
npm install
npm i -g wrangler
wrangler login
wrangler deploy
```

### Set secrets (required)

```bash
wrangler secret put RESEND_API_KEY
wrangler secret put OWNER_EMAIL
```

`OWNER_EMAIL` is where YOU receive a copy of every quote.

### Set non-secret vars (wrangler.toml)

Edit `backend/cloudflare-worker/wrangler.toml`:

- `STORE_CONFIG_BASE_URL`:
  - Default GitHub Pages: `https://USERNAME.github.io/REPO`
  - Custom domain: `https://yourdomain.com`

- `EMAIL_FROM`:
  - For MVP: `Commerce Hub <onboarding@resend.dev>`
  - For production: verify your domain in Resend and use an address on your domain

### Plug Worker URL into the site config

After `wrangler deploy`, copy your Worker URL and set:

`commercehub.config.json → backend.quote_api_url`

Then redeploy the site:

```bash
cd ../../
npm run deploy
```

---

## 7) Testing end-to-end

1) Open your store (e.g. `/cubclub/`)
2) Add items to cart
3) Open cart → fill name/email → "Email my quote"
4) You + customer should receive a PDF quote

---

## Troubleshooting

### Stores 404
- Ensure GitHub Pages is set to `gh-pages` branch, root folder.

### Checkout backend error
- Confirm `backend.quote_api_url` is correct in `commercehub.config.json`
- Confirm Worker deployed and reachable

### Worker can’t fetch store config
- Confirm `STORE_CONFIG_BASE_URL` is correct
- Confirm this URL works:
  - `https://YOUR_SITE/cubclub/config/site_config.json`

### Emails not sending
- Confirm `RESEND_API_KEY` is set
- Confirm `EMAIL_FROM` is allowed by your Resend settings

---

## MVP honesty
This is built to get you selling fast.
Production hardening would add:
- rate limiting / bot protection
- logging
- payment integration
- order database
- inventory management
