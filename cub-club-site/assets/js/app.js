(() => {
  // Support either config name (old/new)
  const CONFIG = Object.assign(
    {},
    window.APP_CONFIG || {},
    window.CUBCLUB_CONFIG || {}
  );

  const { $, $$, on, scrollToId } = window.CubClubDom || {};
  const {
    loadCart, addItem, setQty, removeItem, clearCart,
    getCount, getSubtotal, formatMoney, buildCartSummary
  } = window.CubClubCart || {};
  const { showToast } = window.CubClubToast || {};
  const { applyConfigToContact, initWhatsApp } = window.CubClubWA || {};

  if (!$ || !$$ || !on) {
    console.warn("Cub Club: DOM helpers not loaded; scripts may be out of order.");
    return;
  }
  if (!loadCart || !addItem) {
    console.warn("Cub Club: cart helpers not loaded; check scripts are included.");
  }

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

    $$(".open-cart").forEach((el) => on(el, "click", (e) => {
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
      const btn = e.target.closest("button");
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
  function bindCheckout() {
    on($("#checkoutBtn"), "click", () => {
      const items = cartItemsArray();
      if (!items.length) {
        closeDrawer();
        scrollToId?.("kits");
        showToast?.("Add something first");
        return;
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
    });

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

  document.addEventListener("DOMContentLoaded", init);
})();