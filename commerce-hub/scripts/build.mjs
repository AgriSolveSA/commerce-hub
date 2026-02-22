\
    import fs from "fs";
    import path from "path";

    const root = process.cwd();
    const cfgPath = path.join(root, "commercehub.config.json");
    const outDir = path.join(root, "public");

    function must(condition, msg) {
      if (!condition) throw new Error(msg);
    }

    function cleanDir(dir) {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
    }

    function write(filePath, contents) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, contents, "utf-8");
    }

    function htmlEscape(s = "") {
      return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function asMoneyZAR(n) {
      const v = Number(n || 0);
      return "R " + v.toFixed(2);
    }

    const STORE_JS = `(() => {
      const el = (q) => document.querySelector(q);
      const els = (q) => Array.from(document.querySelectorAll(q));

      const state = {
        cfg: null,
        cart: []
      };

      function cartKey() {
        const slug = state.cfg?.store?.slug || "store";
        return "ch_cart_" + slug;
      }

      function loadCart() {
        try {
          const raw = localStorage.getItem(cartKey());
          state.cart = raw ? JSON.parse(raw) : [];
        } catch {
          state.cart = [];
        }
      }

      function saveCart() {
        localStorage.setItem(cartKey(), JSON.stringify(state.cart));
      }

      function money(n) {
        return "R " + Number(n || 0).toFixed(2);
      }

      function findProduct(sku) {
        return (state.cfg?.products || []).find(p => p.sku === sku);
      }

      function addToCart(sku) {
        const item = state.cart.find(i => i.sku === sku);
        if (item) item.qty += 1;
        else state.cart.push({ sku, qty: 1 });
        saveCart();
        renderCart();
      }

      function setQty(sku, qty) {
        qty = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
        const item = state.cart.find(i => i.sku === sku);
        if (item) item.qty = qty;
        saveCart();
        renderCart();
      }

      function removeItem(sku) {
        state.cart = state.cart.filter(i => i.sku !== sku);
        saveCart();
        renderCart();
      }

      function calcTotal() {
        let total = 0;
        for (const it of state.cart) {
          const p = findProduct(it.sku);
          if (!p) continue;
          total += Number(p.price) * Number(it.qty);
        }
        return total;
      }

      function renderProducts() {
        const grid = el("#products");
        const prods = state.cfg?.products || [];
        if (!prods.length) {
          grid.innerHTML = '<div class="muted">No products yet. Add products in commercehub.config.json → deploy.</div>';
          return;
        }

        grid.innerHTML = prods.map(p => `
          <div class="card">
            <div class="card__title">${escapeHtml(p.name)}</div>
            <div class="card__meta">${escapeHtml(p.sku)} • <b>${money(p.price)}</b></div>
            <button class="btn" data-add="${escapeHtml(p.sku)}">Add to cart</button>
          </div>
        `).join("");

        els("[data-add]").forEach(b => {
          b.addEventListener("click", () => addToCart(b.getAttribute("data-add")));
        });
      }

      function renderCart() {
        const cartBox = el("#cartItems");
        const totalBox = el("#cartTotal");
        const countBox = el("#cartCount");

        const count = state.cart.reduce((a, b) => a + (b.qty || 0), 0);
        countBox.textContent = String(count);

        if (!state.cart.length) {
          cartBox.innerHTML = '<div class="muted">Cart is empty.</div>';
          totalBox.textContent = money(0);
          return;
        }

        cartBox.innerHTML = state.cart.map(it => {
          const p = findProduct(it.sku);
          const name = p ? p.name : it.sku;
          const price = p ? Number(p.price) : 0;
          const line = price * Number(it.qty);

          return `
            <div class="cartRow">
              <div class="cartRow__info">
                <div class="cartRow__name">${escapeHtml(name)}</div>
                <div class="cartRow__meta">${escapeHtml(it.sku)} • ${money(price)} each</div>
              </div>
              <div class="cartRow__controls">
                <input class="qty" type="number" min="1" max="99" value="${it.qty}" data-qty="${escapeHtml(it.sku)}" />
                <div class="cartRow__line">${money(line)}</div>
                <button class="btn btn--ghost" data-rm="${escapeHtml(it.sku)}">Remove</button>
              </div>
            </div>
          `;
        }).join("");

        els("[data-qty]").forEach(inp => {
          inp.addEventListener("change", () => setQty(inp.getAttribute("data-qty"), inp.value));
        });
        els("[data-rm]").forEach(btn => {
          btn.addEventListener("click", () => removeItem(btn.getAttribute("data-rm")));
        });

        totalBox.textContent = money(calcTotal());
      }

      async function submitQuote() {
        const btn = el("#submitQuote");
        const msg = el("#checkoutMsg");
        msg.textContent = "";

        const name = el("#cName").value.trim();
        const email = el("#cEmail").value.trim();
        const phone = el("#cPhone").value.trim();
        const note = el("#cNote").value.trim();

        if (!state.cart.length) {
          msg.textContent = "Your cart is empty.";
          return;
        }
        if (!name || !email) {
          msg.textContent = "Please enter your name and email.";
          return;
        }

        btn.disabled = true;
        btn.textContent = "Sending…";

        try {
          const res = await fetch(state.cfg.backend.quote_api_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              store_slug: state.cfg.store.slug,
              customer: { name, email, phone },
              note,
              items: state.cart.map(i => ({ sku: i.sku, qty: i.qty })),
              client: { page_url: location.href, ua: navigator.userAgent }
            })
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok) {
            throw new Error(data.error || ("Request failed (" + res.status + ")"));
          }

          msg.innerHTML = "✅ Quote sent! Quote No: <b>" + escapeHtml(data.quote_no) + "</b><br/>Check your email. We also sent a copy to the store owner.";
          state.cart = [];
          saveCart();
          renderCart();
        } catch (e) {
          msg.textContent = "❌ " + (e?.message || "Something went wrong.");
        } finally {
          btn.disabled = false;
          btn.textContent = "Email my quote";
        }
      }

      function escapeHtml(s="") {
        return String(s)
          .replaceAll("&","&amp;")
          .replaceAll("<","&lt;")
          .replaceAll(">","&gt;")
          .replaceAll('"',"&quot;");
      }

      async function init() {
        const cfgUrl = "./config/site_config.json";
        const res = await fetch(cfgUrl, { cache: "no-store" });
        if (!res.ok) throw new Error("Could not load config: " + cfgUrl);

        state.cfg = await res.json();
        document.title = state.cfg.store.name;

        el("#storeName").textContent = state.cfg.store.name;
        el("#supportEmail").textContent = state.cfg.store.support_email || "";
        el("#supportEmail").href = state.cfg.store.support_email ? ("mailto:" + state.cfg.store.support_email) : "#";
        el("#waLink").href = state.cfg.store.whatsapp || "#";

        loadCart();
        renderProducts();
        renderCart();

        el("#openCart").addEventListener("click", () => el("#cartPanel").classList.add("open"));
        el("#closeCart").addEventListener("click", () => el("#cartPanel").classList.remove("open"));
        el("#submitQuote").addEventListener("click", submitQuote);
      }

      init().catch(err => {
        console.error(err);
        el("#app").innerHTML = "<div class='error'>Failed to load store config. Check ./config/site_config.json</div>";
      });
    })();`;

    const STYLES = `
    :root{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial}
    body{margin:0;background:#fff;color:#111}
    a{color:inherit}
    .header{padding:18px 16px;border-bottom:1px solid #eee;background:#fafafa}
    .wrap{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .brand{display:flex;flex-direction:column}
    .brand h1{margin:0;font-size:18px}
    .brand .muted{margin:3px 0 0;color:#555;font-size:13px}
    .actions{display:flex;gap:10px;align-items:center}
    .btn{border:1px solid #ddd;background:#111;color:#fff;border-radius:12px;padding:10px 12px;cursor:pointer}
    .btn:hover{filter:brightness(1.05)}
    .btn--ghost{background:#fff;color:#111}
    .main{max-width:1100px;margin:0 auto;padding:18px 16px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
    .card{border:1px solid #eee;border-radius:16px;padding:14px;box-shadow:0 1px 0 rgba(0,0,0,.03)}
    .card__title{font-weight:700;margin-bottom:6px}
    .card__meta{color:#555;font-size:13px;margin-bottom:10px}
    .pill{display:inline-flex;align-items:center;gap:8px;border:1px solid #ddd;background:#fff;border-radius:999px;padding:8px 10px}
    .pill b{font-weight:700}
    .cart{position:fixed;top:0;right:0;height:100%;width:420px;max-width:95vw;background:#fff;border-left:1px solid #eee;transform:translateX(100%);transition:transform .2s ease;display:flex;flex-direction:column}
    .cart.open{transform:translateX(0)}
    .cartHead{padding:14px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center}
    .cartBody{padding:12px;overflow:auto;flex:1}
    .cartFoot{padding:12px;border-top:1px solid #eee}
    .cartRow{display:flex;gap:12px;align-items:flex-start;border-bottom:1px solid #f2f2f2;padding:10px 0}
    .cartRow__info{flex:1}
    .cartRow__name{font-weight:700}
    .cartRow__meta{color:#666;font-size:12px;margin-top:3px}
    .cartRow__controls{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
    .qty{width:72px;padding:8px;border:1px solid #ddd;border-radius:10px}
    .cartRow__line{font-weight:700}
    .totalRow{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
    .form{display:grid;gap:8px}
    .input{padding:10px;border:1px solid #ddd;border-radius:12px}
    .muted{color:#666;font-size:13px}
    .error{border:1px solid #ffb3b3;background:#fff5f5;padding:12px;border-radius:12px}
    .small{font-size:12px;color:#666}
    `;

    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));

    must(cfg.backend?.quote_api_url, "Missing backend.quote_api_url in commercehub.config.json");
    must(Array.isArray(cfg.stores) && cfg.stores.length > 0, "You need at least 1 store in stores[]");

    cleanDir(outDir);

    // Custom domain support (writes CNAME)
    if (cfg.custom_domain && String(cfg.custom_domain).trim()) {
      write(path.join(outDir, "CNAME"), String(cfg.custom_domain).trim() + "\n");
    }

    // Shared assets
    write(path.join(outDir, "assets", "styles.css"), STYLES);
    write(path.join(outDir, "assets", "store.js"), STORE_JS);

    // Root homepage
    const storeLinks = cfg.stores
      .map((s) => {
        must(s.slug, "Each store needs a slug");
        must(/^[a-z0-9-]+$/.test(s.slug), `Store slug '${s.slug}' must be lowercase a-z, 0-9, or '-'`);
        return `<a class="card" href="./${s.slug}/">
          <div class="card__title">${htmlEscape(s.name || s.slug)}</div>
          <div class="card__meta">Open store →</div>
        </a>`;
      })
      .join("\n");

    write(
      path.join(outDir, "index.html"),
      `<!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${htmlEscape(cfg.brand || "Commerce Hub")}</title>
      <link rel="stylesheet" href="./assets/styles.css" />
    </head>
    <body>
      <div class="header">
        <div class="wrap">
          <div class="brand">
            <h1>${htmlEscape(cfg.brand || "Commerce Hub")}</h1>
            <div class="muted">Choose a store.</div>
          </div>
          <div class="actions">
            <span class="pill"><b>${htmlEscape(cfg.stores.length)}</b> stores</span>
          </div>
        </div>
      </div>

      <div class="main">
        <div class="grid">
          ${storeLinks}
        </div>
        <p class="small" style="margin-top:14px;">
          Built from <code>commercehub.config.json</code>.
        </p>
      </div>
    </body>
    </html>`
    );

    // Each store
    for (const s of cfg.stores) {
      const storeDir = path.join(outDir, s.slug);

      const storeCfg = {
        store: {
          slug: s.slug,
          name: s.name || s.slug,
          whatsapp: s.whatsapp || "",
          support_email: s.support_email || "",
          banking: s.banking || {}
        },
        products: s.products || [],
        backend: { quote_api_url: cfg.backend.quote_api_url }
      };

      write(path.join(storeDir, "config", "site_config.json"), JSON.stringify(storeCfg, null, 2));

      write(
        path.join(storeDir, "index.html"),
        `<!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${htmlEscape(storeCfg.store.name)}</title>
      <link rel="stylesheet" href="../assets/styles.css" />
    </head>
    <body>
      <div class="header">
        <div class="wrap">
          <div class="brand">
            <h1 id="storeName">${htmlEscape(storeCfg.store.name)}</h1>
            <div class="muted">
              Support: <a id="supportEmail" href="#"></a> •
              <a id="waLink" href="#" target="_blank" rel="noopener">WhatsApp</a> •
              <a href="../">All stores</a>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn--ghost" id="openCart">
              Cart <span class="pill"><b id="cartCount">0</b></span>
            </button>
          </div>
        </div>
      </div>

      <div class="main" id="app">
        <div class="grid" id="products"></div>
      </div>

      <aside class="cart" id="cartPanel" aria-label="Cart">
        <div class="cartHead">
          <b>Your cart</b>
          <button class="btn btn--ghost" id="closeCart">Close</button>
        </div>

        <div class="cartBody">
          <div id="cartItems"></div>
        </div>

        <div class="cartFoot">
          <div class="totalRow">
            <div class="muted">Total</div>
            <div><b id="cartTotal">${asMoneyZAR(0)}</b></div>
          </div>

          <div class="form">
            <input class="input" id="cName" placeholder="Your name" />
            <input class="input" id="cEmail" placeholder="Email address" />
            <input class="input" id="cPhone" placeholder="Phone (optional)" />
            <input class="input" id="cNote" placeholder="Note (optional)" />
            <button class="btn" id="submitQuote">Email my quote</button>
            <div class="muted" id="checkoutMsg"></div>
            <div class="small">Quotes are emailed to you + the store owner. Payment instructions are inside the email/PDF.</div>
          </div>
        </div>
      </aside>

      <script src="../assets/store.js"></script>
    </body>
    </html>`
      );
    }

    console.log("✅ Build complete → public/");
