# Cub Club – Static Site (Maintainable + Working Cart)

This project takes your original single-file `index.html` and splits it into small, maintainable parts
with a **tiny build step** that stitches everything back together.

✅ No frameworks  
✅ Works on basic hosting (Netlify, GitHub Pages, cPanel, etc.)  
✅ Cart persists in the browser (localStorage)  
✅ “Checkout” drops a clean order summary into the Contact form + WhatsApp message

---

## Project layout

- `src/index.template.html` – main page template (includes partials)
- `src/partials/*.html` – the “small parts” (hero, kits, addons, etc.)
- `assets/css/styles.css` – all styles
- `assets/js/app.js` – app entry (cart UI + bindings)
- `assets/js/config.js` – **edit this** (WhatsApp number, email, Formspree, payment links)
- `assets/js/modules/*` – separated JS modules (cart, storage, toast, WhatsApp)

Compiled output:
- `index.html` – ready-to-host page (already built for you)
- `dist/index.html` – build output (same as root index)

---

## 1) Edit your business settings (important)

Open: `assets/js/config.js`

Update:
- `WHATSAPP_NUMBER` (e.g. `"27XXXXXXXXX"`)
- `SUPPORT_EMAIL`
- `FORMSPREE_ENDPOINT`
- `PAYMENT_LINKS` (optional)

---

## 2) Run locally

Option A (simplest):
- Just open `index.html` in your browser (works even via `file://`).

Option B (recommended – local server is still best for testing your final hosting setup):
```bash
python -m http.server 8080
```
Then open:
- http://localhost:8080

---

## 3) Editing the website (maintainable workflow)

Edit the partials in `src/partials/` and then rebuild:

```bash
python build.py
```

This regenerates:
- `dist/index.html`

We also keep a ready-to-host `index.html` at the project root.
If you want the root `index.html` to match the latest build, just copy:

```bash
copy dist\index.html index.html   # Windows
# or
cp dist/index.html index.html     # macOS/Linux
```

---

## How checkout works

- Users click **Add to cart** on any kit/add-on.
- Open **Cart** from the navbar.
- Click **Checkout**:
  - Inserts an “Order summary” into the Contact form message box.
  - Updates WhatsApp link to include the cart summary.

This avoids needing a full payment gateway/cart backend while still giving you a real cart experience.

---

## Replace product images

Current images in `assets/images/*.svg` are placeholders.
Replace them with your real images (keep the filenames the same), e.g.

- `assets/images/essential_kit.png` → use `essential_kit.png` and update the HTML paths.

---

## Notes

- Cart data is stored in browser `localStorage` (per device).
- If you later want “real checkout”, we can connect this to PayFast / Yoco / PayGate with serverless functions.
