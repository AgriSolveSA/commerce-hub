(() => {
  // Support either config name (old/new)
  const CONFIG = Object.assign(
    {},
    window.APP_CONFIG || {},
    window.CUBCLUB_CONFIG || {}
  );

  // --- Hardened helpers: works with modules OR standalone app.js ---
  const domFallback = {
    $: (sel, root = document) => root ? root.querySelector(sel) : null,
    $$: (sel, root = document) => Array.from(root ? root.querySelectorAll(sel) : []),
    on(el, evt, fn, opts) { if (el) el.addEventListener(evt, fn, opts); },
    scrollToId(id) {
      const el = document.getElementById(id);
      if (!el) return;
      try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch { el.scrollIntoView(); }
    }
  };
  const { $, $$, on, scrollToId } = Object.assign({}, domFallback, window.CubClubDom || {});

  const storageFallback = {
    get(key, fallback) {
      try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch { return false; }
    }
  };

  const cartFallback = {
    loadCart() {
      const c = (window.CubClubStorage || storageFallback).get('cubclub_cart', { items: {} }) || { items: {} };
      c.items ||= {};
      return c;
    },
    saveCart(cart) { (window.CubClubStorage || storageFallback).set('cubclub_cart', cart); return cart; },
    addItem(cart, item, qty = 1) {
      const next = (typeof structuredClone === 'function')
        ? structuredClone(cart || { items: {} })
        : JSON.parse(JSON.stringify(cart || { items: {} }));
      next.items ||= {};
      const cur = next.items[item.id] || { ...item, qty: 0 };
      cur.qty = (Number(cur.qty) || 0) + (Number(qty) || 1);
      next.items[item.id] = cur;
      return this.saveCart(next);
    },
    setQty(cart, id, qty) {
      const next = (typeof structuredClone === 'function')
        ? structuredClone(cart || { items: {} })
        : JSON.parse(JSON.stringify(cart || { items: {} }));
      next.items ||= {};
      if (!next.items[id]) return next;
      const q = Number(qty) || 0;
      if (q <= 0) delete next.items[id]; else next.items[id].qty = q;
      return this.saveCart(next);
    },
    removeItem(cart, id) { return this.setQty(cart, id, 0); },
    clearCart() { return this.saveCart({ items: {} }); },
    getCount(cart) { return Object.values((cart && cart.items) || {}).reduce((a, it) => a + (Number(it.qty) || 0), 0); },
    getSubtotal(cart) { return Object.values((cart && cart.items) || {}).reduce((a, it) => a + ((Number(it.qty)||0) * (Number(it.price)||0)), 0); },
    formatMoney(n) { return `R${Math.round(Number(n) || 0)}`; },
    buildCartSummary(cart) {
      const items = Object.values((cart && cart.items) || {});
      if (!items.length) return 'Order summary\n- (empty cart)';
      const lines = ['Order summary:'];
      for (const it of items) {
        const q = Number(it.qty) || 0;
        const p = Number(it.price) || 0;
        lines.push(`- ${it.name} x${q} = R${q*p}`);
      }
      lines.push(`Subtotal: R${this.getSubtotal(cart)}`);
      lines.push('Shipping: PUDO (paid by customer)');
      return lines.join('\n');
    }
  };
  const cartApi = window.CubClubCart || {};
  const loadCart = cartApi.loadCart || cartFallback.loadCart.bind(cartFallback);
  const addItem = cartApi.addItem || cartFallback.addItem.bind(cartFallback);
  const setQty = cartApi.setQty || cartFallback.setQty.bind(cartFallback);
  const removeItem = cartApi.removeItem || cartFallback.removeItem.bind(cartFallback);
  const clearCart = cartApi.clearCart || cartFallback.clearCart.bind(cartFallback);
  const getCount = cartApi.getCount || cartFallback.getCount.bind(cartFallback);
  const getSubtotal = cartApi.getSubtotal || cartFallback.getSubtotal.bind(cartFallback);
  const formatMoney = cartApi.formatMoney || cartFallback.formatMoney.bind(cartFallback);
  const buildCartSummary = cartApi.buildCartSummary || cartFallback.buildCartSummary.bind(cartFallback);

  const toastFallback = {
    showToast(msg) {
      const t = document.getElementById('toast');
      if (!t) { console.log('Toast:', msg); return; }
      t.textContent = String(msg || 'Done');
      t.setAttribute('data-show', 'true');
      clearTimeout(toastFallback._timer);
      toastFallback._timer = setTimeout(() => t.setAttribute('data-show', 'false'), 1800);
    }
  };
  const { showToast } = Object.assign({}, toastFallback, window.CubClubToast || {});

  const waFallback = {
    applyConfigToContact() {
      const emailDirect = document.getElementById('emailDirect');
      const supportEmail = CONFIG.SUPPORT_EMAIL || CONFIG.support_email;
      if (emailDirect && supportEmail && !String(supportEmail).includes('YOUR_EMAIL')) {
        emailDirect.href = `mailto:${supportEmail}?subject=Cub%20Club%20Quote%20Request`;
      }
    },
    initWhatsApp(getCart) {
      const link = document.getElementById('waLink');
      const raw = CONFIG.WHATSAPP_NUMBER || CONFIG.whatsapp_number || '';
      const digits = String(raw).replace(/\D/g, '');
      function updateWA() {
        if (!link) return;
        const cart = typeof getCart === 'function' ? getCart() : { items: {} };
        const summary = (typeof buildCartSummary === 'function') ? buildCartSummary(cart) : 'Quote request';
        if (!digits) { link.href = '#'; return; }
        const text = `Hi Cub Club, I'd like a quote.\n\n${summary}`;
        link.href = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
      }
      updateWA();
      return { updateWA };
    }
  };
  const { applyConfigToContact, initWhatsApp } = Object.assign({}, waFallback, window.CubClubWA || {});

  if (!window.CubClubDom) console.warn('Cub Club: DOM helpers not loaded, using internal fallback helpers.');
  if (!window.CubClubCart) console.warn('Cub Club: cart helpers not loaded, using internal fallback cart logic.');

  let cart = loadCart ? loadCart() : { items: {} };
  let waCtl = null;

  function setYear() {
    const y = $("#y");
    if (y) y.textContent = String(new Date().getFullYear());
  }

  function setPaymentLinks() {
    // Optional: set single-item pay links from CONFIG
    $$("[data-pay-link]").forEach((a) => {
      const key = a.getAttribute("data-pay-link");
      const url = CONFIG.PAYMENT_LINKS?.[key];
      if (url && !String(url).includes("YOUR-PAYMENT-LINK")) {
        a.href = url;
        a.classList.remove("is-placeholder");
        a.removeAttribute("aria-disabled");
      } else {
        a.href = "#contact";
        a.classList.add("is-placeholder");
        a.setAttribute("aria-disabled", "true");
      }
    });
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cartItemsArray() {
    return Object.values(cart.items || {});
  }

  function getCartItemsForQuote() {
    // Full line items for backend subtotal + email breakdown
    return cartItemsArray().map((it) => ({
      id: it.id || "",
      sku: it.sku || it.id || "",
      name: it.name || "Item",
      qty: Number(it.qty) || 1,
      price: Number(it.price) || 0
    }));
  }

  function renderCart() {
    const count = getCount ? getCount(cart) : 0;
    const subtotal = getSubtotal ? getSubtotal(cart) : 0;

    const badge = $("#cartCount");
    if (badge) badge.textContent = String(count);

    const itemsWrap = $("#cartItems");
    if (!itemsWrap) return;

    const items = cartItemsArray();

    if (!items.length) {
      itemsWrap.innerHTML = `<div class="cartEmpty">Your cart is empty. Add a kit or add-on to get started.</div>`;
    } else {
      itemsWrap.innerHTML = items.map((it) => {
        const lineTotal = Number(it.price || 0) * Number(it.qty || 0);
        return `
          <div class="cartItem" data-id="${escapeHtml(it.id)}">
            <div>
              <div class="cartItemName">${escapeHtml(it.name)}</div>
              <div class="cartItemMeta">${formatMoney ? formatMoney(it.price) : it.price} each</div>
              <div class="qtyRow">
                <button class="qtyBtn" data-act="dec" type="button" aria-label="Decrease quantity">–</button>
                <div class="qtyVal" aria-label="Quantity">${it.qty}</div>
                <button class="qtyBtn" data-act="inc" type="button" aria-label="Increase quantity">+</button>
                <button class="removeBtn" data-act="remove" type="button">Remove</button>
              </div>
            </div>
            <div class="cartItemPrice">${formatMoney ? formatMoney(lineTotal) : lineTotal}</div>
          </div>
        `;
      }).join("");
    }

    const subEl = $("#cartSubtotal");
    if (subEl) subEl.textContent = formatMoney ? formatMoney(subtotal) : String(subtotal);

    // Keep hidden cart field up to date (Formspree fallback / auditing / backend compatibility)
    const cartJson = $("#cart_json");
    if (cartJson) cartJson.value = JSON.stringify(getCartItemsForQuote());

    // Update checkout CTA text
    const checkoutBtn = $("#checkoutBtn");
    if (checkoutBtn) {
      checkoutBtn.textContent = items.length && formatMoney
        ? `Checkout • ${formatMoney(subtotal)}`
        : "Checkout • Get Quote";
    }

    // Keep WhatsApp link synced
    waCtl?.updateWA?.();
  }

  /* ---------- Drawer open/close ---------- */
  function openDrawer() {
    const d = $("#cartDrawer");
    if (!d) return;
    d.dataset.open = "true";
    d.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    const d = $("#cartDrawer");
    if (!d) return;
    d.dataset.open = "false";
    d.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function bindDrawer() {
    const d = $("#cartDrawer");
    if (!d) return;

    on($("#cartBtn"), "click", () => {
      renderCart();
      openDrawer();
    });

    $$("[data-open-cart], .open-cart").forEach((el) => on(el, "click", (e) => {
      e.preventDefault();
      renderCart();
      openDrawer();
    }));

    on($("#cartClose"), "click", closeDrawer);
    on($("#cartOverlay"), "click", closeDrawer);

    on(document, "keydown", (e) => {
      if (e.key === "Escape" && d.dataset.open === "true") closeDrawer();
    });

    // Delegated actions (inc/dec/remove)
    on(d, "click", (e) => {
      const targetEl = (e.target && e.target.nodeType === 1) ? e.target : e.target?.parentElement;
      const btn = targetEl?.closest ? targetEl.closest("button") : null;
      if (!btn) return;

      const act = btn.getAttribute("data-act");
      if (!act) return;

      const itemEl = btn.closest(".cartItem");
      const id = itemEl?.getAttribute("data-id");
      if (!id) return;

      const current = cart.items?.[id];
      if (!current) return;

      if (act === "inc") cart = setQty ? setQty(cart, id, current.qty + 1) : cart;
      if (act === "dec") cart = setQty ? setQty(cart, id, current.qty - 1) : cart;
      if (act === "remove") cart = removeItem ? removeItem(cart, id) : cart;

      renderCart();
    });
  }

  /* ---------- Add-to-cart buttons ---------- */
  function bindAddToCart() {
    $$("[data-add]").forEach((btn) => {
      on(btn, "click", () => {
        const id = btn.getAttribute("data-id");
        const sku = btn.getAttribute("data-sku") || id;
        const name = btn.getAttribute("data-name");
        const price = Number(btn.getAttribute("data-price") || "0");

        if (!id || !name || !price) return;

        cart = addItem ? addItem(cart, { id, sku, name, price }, 1) : cart;
        renderCart();
        showToast?.("Added to cart");
      });
    });
  }

  /* ---------- Quote helpers (backend payload) ---------- */
  function buildQuotePayloadFromForm() {
    const name = $("#name")?.value?.trim() || "";
    const email = $("#email")?.value?.trim() || "";
    const phone = $("#phone")?.value?.trim() || "";
    const pudo = $("#pudo")?.value?.trim() || "";
    const kit = $("#kit")?.value?.trim() || "Other / Cart checkout";
    const orderref = $("#orderref")?.value?.trim() || "";
    const message = $("#message")?.value?.trim() || "";

    const items = getCartItemsForQuote();

    // Keep hidden cart JSON synced before submit
    const cartJsonField = $("#cart_json");
    const cart_json = JSON.stringify(items);
    if (cartJsonField) cartJsonField.value = cart_json;

    // Optional honeypot support if you add a hidden field later
    const website = $("#website")?.value?.trim() || "";

    return {
      // Primary (matches Worker we built)
      storeSlug: CONFIG.STORE_SLUG || "cubclub",
      name,
      email,
      phone,
      pudo,
      kit,
      orderref,
      notes: message,
      items,
      cart_json,
      sourceUrl: window.location.href,
      website,

      // Compatibility aliases (harmless, helps if backend evolves)
      store_slug: CONFIG.STORE_SLUG || "cubclub",
      message,
      client: {
        page_url: window.location.href,
        ua: navigator.userAgent
      }
    };
  }

  async function sendQuoteFromContactForm(e) {
    const form = $("#contactForm");
    if (!form) return;

    const apiUrl = String(CONFIG.QUOTE_API_URL || "").trim();

    // If backend is not configured, allow normal Formspree submit (fallback)
    if (!apiUrl || apiUrl.includes("YOUR-WORKER")) {
      return;
    }

    e.preventDefault();

    const items = cartItemsArray();
    if (!items.length) {
      showToast?.("Add something to cart first");
      closeDrawer();
      scrollToId?.("kits");
      return;
    }

    const name = $("#name")?.value?.trim() || "";
    const email = $("#email")?.value?.trim() || "";
    const phone = $("#phone")?.value?.trim() || "";
    const pudo = $("#pudo")?.value?.trim() || "";

    if (!name || !email || !phone || !pudo) {
      showToast?.("Please complete name, email, phone and PUDO area");
      scrollToId?.("contact");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent || "Email me my quote (EFT)";

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending quote...";
    }

    try {
      const payload = buildQuotePayloadFromForm();

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        const details = Array.isArray(data?.details) ? `: ${data.details.join(", ")}` : "";
        throw new Error((data?.error || `Quote request failed (${res.status})`) + details);
      }

      // Worker returns "reference" (older versions may return "quote_no")
      const quoteRef = data.reference || data.quote_no || "";

      // Put quote ref into form so user can reuse it for POP later
      const orderRefInput = $("#orderref");
      if (orderRefInput && quoteRef) orderRefInput.value = quoteRef;

      showToast?.(quoteRef ? `Quote sent! Ref: ${quoteRef}` : "Quote sent! Check your email.");

      // Optional success note in message field (helpful for user screenshot/record)
      const msgBox = $("#message");
      if (msgBox && quoteRef) {
        const marker = `Quote reference: ${quoteRef}`;
        if (!String(msgBox.value || "").includes("Quote reference:")) {
          msgBox.value = `${msgBox.value || ""}\n\nQuote sent successfully.\n${marker}`.trim();
        }
      }

      // Optional: clear cart after successful quote (tonight flow)
      cart = clearCart ? clearCart() : { items: {} };
      renderCart();

      closeDrawer();
      scrollToId?.("contact");
    } catch (err) {
      console.error(err);
      showToast?.(err?.message || "Failed to send quote");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  }

  /* ---------- Checkout helpers ---------- */
  function moveCartToCheckout() {
    const items = cartItemsArray();
    if (!items.length) {
      closeDrawer();
      scrollToId?.("kits");
      showToast?.("Add something first");
      return false;
    }

    // Fill message box with cart summary (append if user already typed)
    const msg = $("#message");
    if (msg && buildCartSummary) {
      const summary = buildCartSummary(cart);
      const existing = msg.value?.trim();
      if (!existing) msg.value = summary;
      else if (!existing.includes("Order summary")) msg.value = `${existing}\n\n${summary}`;
    }

    // Set dropdown to neutral value for cart checkout
    const kitSel = $("#kit");
    if (kitSel) kitSel.value = "Other";

    // Sync hidden cart JSON
    const cartJson = $("#cart_json");
    if (cartJson) cartJson.value = JSON.stringify(getCartItemsForQuote());

    closeDrawer();
    scrollToId?.("contact");
    showToast?.("Cart added to checkout");
    return true;
  }

  function bindCheckout() {
    on($("#checkoutBtn"), "click", moveCartToCheckout);

    // Product/card checkout buttons should work too.
    // If cart is empty, auto-add the product from the same card first, then continue.
    $$("[data-checkout]").forEach(btn => on(btn, "click", () => {
      const hasItems = cartItemsArray().length > 0;
      if (!hasItems) {
        const card = btn.closest(".card");
        const addBtn = card?.querySelector?.("[data-add]");
        if (addBtn?.dataset) {
          const id = addBtn.dataset.id;
          const sku = addBtn.dataset.sku || id;
          const name = addBtn.dataset.name;
          const price = Number(addBtn.dataset.price);
          if (id && name && price) {
            cart = addItem ? addItem(cart, { id, sku, name, price }, 1) : cart;
            renderCart();
          }
        }
      }
      moveCartToCheckout();
    }));

    on($("#copyCartBtn"), "click", async () => {
      if (!buildCartSummary) return;

      const summary = buildCartSummary(cart);
      try {
        await navigator.clipboard.writeText(summary);
        showToast?.("Copied order summary");
      } catch {
        const ta = document.createElement("textarea");
        ta.value = summary;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        showToast?.("Copied order summary");
      }
    });

    on($("#clearCartBtn"), "click", () => {
      cart = clearCart ? clearCart() : { items: {} };
      renderCart();
      showToast?.("Cart cleared");
    });
  }

  function init() {
    if (!window.CubClubCart || !window.CubClubDom || !window.CubClubStorage) {
      console.warn("Cub Club: helper modules missing; using app.js internal fallbacks where possible.");
    }

    setYear();
    setPaymentLinks();
    applyConfigToContact?.();

    // WhatsApp link should include cart summary
    waCtl = initWhatsApp ? initWhatsApp(() => cart) : null;

    bindAddToCart();
    bindDrawer();
    bindCheckout();

    // Intercept contact form submit and send quote via backend (if configured)
    on($("#contactForm"), "submit", sendQuoteFromContactForm);

    renderCart();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();