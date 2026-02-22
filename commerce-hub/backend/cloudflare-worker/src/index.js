\
    import { PDFDocument, StandardFonts } from "pdf-lib";

    function json(data, status = 200, headers = {}) {
      return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
          "Content-Type": "application/json",
          ...headers
        }
      });
    }

    function corsHeaders(env) {
      const allow = env.ALLOWED_ORIGIN || "*";
      return {
        "Access-Control-Allow-Origin": allow,
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      };
    }

    function must(cond, msg) {
      if (!cond) throw new Error(msg);
    }

    function sanitizeSlug(slug) {
      const s = String(slug || "").trim();
      if (!/^[a-z0-9-]+$/.test(s)) throw new Error("Invalid store_slug.");
      return s;
    }

    function toInt(n, min, max) {
      const v = parseInt(n, 10);
      if (!Number.isFinite(v)) return min;
      return Math.max(min, Math.min(max, v));
    }

    function moneyZAR(n) {
      return "R " + Number(n || 0).toFixed(2);
    }

    function quoteNo() {
      const d = new Date();
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const da = String(d.getUTCDate()).padStart(2, "0");
      const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
      return `Q-${y}${m}${da}-${rand}`;
    }

    async function fetchStoreConfig(env, storeSlug) {
      const base = String(env.STORE_CONFIG_BASE_URL || "").replace(/\/+$/, "");
      must(base.startsWith("http"), "STORE_CONFIG_BASE_URL must be set to your site base URL.");

      const url = `${base}/${storeSlug}/config/site_config.json`;
      const res = await fetch(url, { cf: { cacheTtl: 60, cacheEverything: true } });
      if (!res.ok) throw new Error(`Could not fetch store config: ${url}`);
      return await res.json();
    }

    function priceCartFromConfig(cfg, items) {
      const products = cfg?.products || [];
      const bySku = new Map(products.map(p => [p.sku, p]));

      const lines = [];
      let total = 0;

      for (const it of items) {
        const sku = String(it.sku || "").trim();
        const qty = toInt(it.qty, 1, 99);

        const p = bySku.get(sku);
        if (!p) throw new Error(`Unknown SKU: ${sku}`);

        const unit = Number(p.price);
        if (!Number.isFinite(unit)) throw new Error(`Invalid price for SKU: ${sku}`);

        const lineTotal = unit * qty;
        total += lineTotal;

        lines.push({
          sku,
          name: String(p.name || sku),
          qty,
          unit_price: unit,
          line_total: lineTotal
        });
      }

      return { lines, total };
    }

    async function buildPdf({ quote_no, cfg, customer, lines, total }) {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const page = pdfDoc.addPage([595, 842]); // A4-ish
      let y = 800;

      const draw = (text, size = 11, isBold = false) => {
        page.drawText(String(text), { x: 40, y, size, font: isBold ? bold : font });
        y -= size + 6;
      };

      draw(cfg?.store?.name || "Store", 16, true);
      draw(`Quote No: ${quote_no}`, 12, true);
      draw(`Date: ${new Date().toISOString().slice(0, 10)}`, 11, false);
      y -= 8;

      draw("Customer", 12, true);
      draw(`Name: ${customer.name || ""}`);
      draw(`Email: ${customer.email || ""}`);
      draw(`Phone: ${customer.phone || ""}`);
      y -= 8;

      draw("Items", 12, true);
      for (const l of lines) {
        draw(`${l.qty} x ${l.name} (${l.sku}) — ${moneyZAR(l.unit_price)} = ${moneyZAR(l.line_total)}`);
      }
      y -= 8;

      draw(`TOTAL: ${moneyZAR(total)}`, 13, true);
      y -= 10;

      const b = cfg?.store?.banking || {};
      draw("Payment details", 12, true);
      draw(`Bank: ${b.bank || ""}`);
      draw(`Account name: ${b.account_name || ""}`);
      draw(`Account number: ${b.account_number || ""}`);
      draw(`Branch code: ${b.branch_code || ""}`);
      y -= 8;

      draw("Notes", 12, true);
      draw("Use the Quote No as your payment reference.");
      draw("After payment, reply to the email with proof of payment.");

      const pdfBytes = await pdfDoc.save();
      return pdfBytes;
    }

    function bytesToBase64(bytes) {
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunk));
      }
      return btoa(binary);
    }

    async function sendEmailViaResend(env, payload) {
      const apiKey = env.RESEND_API_KEY;
      must(apiKey, "Missing RESEND_API_KEY secret.");

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`Resend error: ${data?.message || res.status}`);
      }
      return data;
    }

    function escapeHtml(s = "") {
      return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    export default {
      async fetch(req, env) {
        const cors = corsHeaders(env);

        if (req.method === "OPTIONS") {
          return new Response(null, { status: 204, headers: cors });
        }

        try {
          const url = new URL(req.url);
          if (req.method !== "POST" || url.pathname !== "/quote") {
            return json({ ok: false, error: "Not found" }, 404, cors);
          }

          const body = await req.json();
          const store_slug = sanitizeSlug(body.store_slug);

          const customer = body.customer || {};
          must(customer.email, "Customer email is required.");
          must(customer.name, "Customer name is required.");

          const items = Array.isArray(body.items) ? body.items : [];
          must(items.length > 0, "Cart is empty.");

          const ownerEmail = env.OWNER_EMAIL;
          must(ownerEmail, "Missing OWNER_EMAIL secret.");

          // Fetch canonical store config from your website
          const cfg = await fetchStoreConfig(env, store_slug);

          // Price cart from config (prevents browser tampering)
          const { lines, total } = priceCartFromConfig(cfg, items);

          const quote_no = quoteNo();

          // PDF
          const pdfBytes = await buildPdf({ quote_no, cfg, customer, lines, total });
          const pdfBase64 = bytesToBase64(pdfBytes);

          const storeName = cfg?.store?.name || store_slug;

          const htmlLines = lines.map(l =>
            `<li>${l.qty} × ${escapeHtml(l.name)} (${escapeHtml(l.sku)}) — <b>${moneyZAR(l.line_total)}</b></li>`
          ).join("");

          const banking = cfg?.store?.banking || {};

          const html = `
            <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
              <h2>${escapeHtml(storeName)} — Quote ${escapeHtml(quote_no)}</h2>
              <p>Hello ${escapeHtml(customer.name)},</p>
              <p>Here is your quote. PDF attached.</p>

              <h3>Items</h3>
              <ul>${htmlLines}</ul>
              <p><b>Total: ${moneyZAR(total)}</b></p>

              <h3>Payment details</h3>
              <p>
                Bank: ${escapeHtml(banking.bank || "")}<br/>
                Account name: ${escapeHtml(banking.account_name || "")}<br/>
                Account number: ${escapeHtml(banking.account_number || "")}<br/>
                Branch code: ${escapeHtml(banking.branch_code || "")}
              </p>

              <p><b>Payment reference:</b> ${escapeHtml(quote_no)}</p>
              <p>Reply to this email with proof of payment.</p>
            </div>
          `.trim();

          const from = env.EMAIL_FROM;
          must(from, "EMAIL_FROM must be set in wrangler.toml");

          // Send to customer + owner
          await sendEmailViaResend(env, {
            from,
            to: [customer.email, ownerEmail],
            subject: `${storeName} Quote ${quote_no} — ${moneyZAR(total)}`,
            html,
            attachments: [
              {
                filename: `quote-${quote_no}.pdf`,
                content: pdfBase64
              }
            ]
          });

          return json({ ok: true, quote_no, total }, 200, cors);
        } catch (err) {
          return json({ ok: false, error: err?.message || "Unknown error" }, 400, cors);
        }
      }
    };
