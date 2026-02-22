(() => {
  const CONFIG = window.CUBCLUB_CONFIG || {};
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
    $$('[data-pay-link]').forEach(a => {
      const key = a.getAttribute('data-pay-link');
      const url = CONFIG.PAYMENT_LINKS?.[key];
      if (url && !String(url).includes('YOUR-PAYMENT-LINK')) {
        a.href = url;
        a.classList.remove('is-placeholder');
        a.removeAttribute('aria-disabled');
      } else {
        a.href = '#contact';
        a.classList.add('is-placeholder');
        a.setAttribute('aria-disabled', 'true');
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

  function renderCart() {
    const count = getCount ? getCount(cart) : 0;
    const subtotal = getSubtotal ? getSubtotal(cart) : 0;

    const badge = $("#cartCount");
    if (badge) badge.textContent = String(count);

    const itemsWrap = $("#cartItems");
    if (!itemsWrap) return;

    const items = Object.values(cart.items || {});
    if (!items.length) {
      itemsWrap.innerHTML = `<div class="cartEmpty">Your cart is empty. Add a kit or add-on to get started.</div>`;
    } else {
      itemsWrap.innerHTML = items.map(it => {
        const lineTotal = it.price * it.qty;
        return `
          <div class="cartItem" data-id="${it.id}">
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

    // Keep hidden cart field up to date
    const cartJson = $("#cart_json");
    if (cartJson) cartJson.value = JSON.stringify(cart);

    // Update checkout CTA text
    const checkoutBtn = $("#checkoutBtn");
    if (checkoutBtn) checkoutBtn.textContent = items.length && formatMoney ? `Checkout • ${formatMoney(subtotal)}` : "Checkout";

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

    $$(".open-cart").forEach(el => on(el, "click", (e) => {
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

      if (act === "inc") cart = setQty(cart, id, current.qty + 1);
      if (act === "dec") cart = setQty(cart, id, current.qty - 1);
      if (act === "remove") cart = removeItem(cart, id);

      renderCart();
    });
  }

  /* ---------- Add-to-cart buttons ---------- */
  function bindAddToCart() {
    $$('[data-add]').forEach(btn => {
      on(btn, "click", () => {
        const id = btn.getAttribute("data-id");
        const name = btn.getAttribute("data-name");
        const price = Number(btn.getAttribute("data-price") || "0");
        if (!id || !name || !price) return;
        cart = addItem(cart, { id, name, price }, 1);
        renderCart();
        showToast?.("Added to cart");
      });
    });
  }

  /* ---------- Checkout helpers ---------- */
  function bindCheckout() {
    on($("#checkoutBtn"), "click", () => {
      const items = Object.values(cart.items || {});
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

      // Set dropdown to a neutral value
      const kitSel = $("#kit");
      if (kitSel) kitSel.value = "Other";

      closeDrawer();
      scrollToId?.("contact");
      showToast?.("Cart added to your message");
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
      cart = clearCart();
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
    renderCart();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
