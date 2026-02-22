(() => {
  // Support either config name (old/new)
  const CONFIG = Object.assign(
    {},
    window.APP_CONFIG || {},
    window.CUBCLUB_CONFIG || {}
  );

  // --- Hardened helpers: works with modules OR standalone app.js ---
  const domFallback = {
    $: (sel, root = document) => (root ? root.querySelector(sel) : null),
    $$: (sel, root = document) => Array.from(root ? root.querySelectorAll(sel) : []),
    on(el, evt, fn, opts) {
      if (el) el.addEventListener(evt, fn, opts);
    },
    scrollToId(id) {
      const el = document.getElementById(id);
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        el.scrollIntoView();
      }
    }
  };
  const { $, $$, on, scrollToId } = Object.assign({}, domFallback, window.CubClubDom || {});

  const storageFallback = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
  };

  const cartFallback = {
    loadCart() {
      const c =
        (window.CubClubStorage || storageFallback).get("cubclub_cart", { items: {} }) ||
        { items: {} };
      c.items ||= {};
      return c;
    },
    saveCart(cart) {
      (window.CubClubStorage || storageFallback).set("cubclub_cart", cart);
      return cart;
    },
    addItem(cart, item, qty = 1) {
      const next =
        typeof structuredClone === "function"
          ? structuredClone(cart || { items: {} })
          : JSON.parse(JSON.stringify(cart || { items: {} }));
      next.items ||= {};
      const cur = next.items[item.id] || { ...item, qty: 0 };
      cur.qty = (Number(cur.qty) || 0) + (Number(qty) || 1);
      next.items[item.id] = cur;
      return this.saveCart(next);
    },
    setQty(cart, id, qty) {
      const next =
        typeof structuredClone === "function"
          ? structuredClone(cart || { items: {} })
          : JSON.parse(JSON.stringify(cart || { items: {} }));
      next.items ||= {};
      if (!next.items[id]) return next;
      const q = Number(qty) || 0;
      if (q <= 0) delete next.items[id];
      else next.items[id].qty = q;
      return this.saveCart(next);
    },
    removeItem(cart, id) {
      return this.setQty(cart, id, 0);
    },
    clearCart() {
      return this.saveCart({ items: {} });
    },
    getCount(cart) {
      return Object.values((cart && cart.items) || {}).reduce(
        (a, it) => a + (Number(it.qty) || 0),
        0
      );
    },
    getSubtotal(cart) {
      return Object.values((cart && cart.items) || {}).reduce(
        (a, it) => a + (Number(it.qty) || 0) * (Number(it.price) || 0),
        0
      );
    },
    formatMoney(n) {
      return `R${Math.round(Number(n) || 0)}`;
    },
    buildCartSummary(cart) {
      const items = Object.values((cart && cart.items) || {});
      if (!items.length) return "Order summary\n- (empty cart)";
      const lines = ["Order summary:"];
      for (const it of items) {
        const q = Number(it.qty) || 0;
        const p = Number(it.price) || 0;
        lines.push(`- ${it.name} x${q} = R${q * p}`);
      }
      lines.push(`Subtotal: R${this.getSubtotal(cart)}`);
      lines.push("Shipping: PUDO (paid by customer, final quote confirmed after packing)");
      return lines.join("\n");
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
  const buildCartSummary =
    cartApi.buildCartSummary || cartFallback.buildCartSummary.bind(cartFallback);

  const toastFallback = {
    _timer: null,
    showToast(msg) {
      const t = document.getElementById("toast");
      if (!t) {
        console.log("Toast:", msg);
        return;
      }
      t.textContent = String(msg || "Done");
      t.setAttribute("data-show", "true");
      clearTimeout(this._timer);
      this._timer = setTimeout(() => t.setAttribute("data-show", "false"), 1800);
    }
  };
  const { showToast } = Object.assign({}, toastFallback, window.CubClubToast || {});

  function setLinkPlaceholderState(link, isPlaceholder) {
    if (!link) return;
    if (isPlaceholder) {
      link.classList.add("is-placeholder");
      link.setAttribute("aria-disabled", "true");
    } else {
      link.classList.remove("is-placeholder");
      link.removeAttribute("aria-disabled");
    }
  }

  const waFallback = {
    applyConfigToContact() {
      const emailDirect = document.getElementById("emailDirect");
      const supportEmail = CONFIG.SUPPORT_EMAIL || CONFIG.support_email;

      if (!emailDirect) return;

      if (supportEmail && !String(supportEmail).includes("YOUR_EMAIL")) {
        emailDirect.href = `mailto:${supportEmail}?subject=Cub%20Club%20Quote%20Request`;
        setLinkPlaceholderState(emailDirect, false);
      } else {
        emailDirect.href = "#contact";
        setLinkPlaceholderState(emailDirect, true);
      }
    },

    initWhatsApp(getCart) {
      const link = document.getElementById("waLink");
      const raw = CONFIG.WHATSAPP_NUMBER || CONFIG.whatsapp_number || "";
      const digits = String(raw).replace(/\D/g, "");

      function updateWA() {
        if (!link) return;
        const currentCart = typeof getCart === "function" ? getCart() : { items: {} };
        const summary =
          typeof buildCartSummary === "function"
            ? buildCartSummary(currentCart)
            : "Quote request";

        if (!digits) {
          link.href = "#contact";
          setLinkPlaceholderState(link, true);
          return;
        }

        setLinkPlaceholderState(link, false);
        const text = `Hi Cub Club, I'd like a quote.\n\n${summary}`;
        link.href = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
      }

      updateWA();
      return { updateWA };
    }
  };
  const { applyConfigToContact, initWhatsApp } = Object.assign(
    {},
    waFallback,
    window.CubClubWA || {}
  );

  if (!window.CubClubDom) {
    console.warn("Cub Club: DOM helpers not loaded, using internal fallback helpers.");
  }
  if (!window.CubClubCart) {
    console.warn("Cub Club: cart helpers not loaded, using internal fallback cart logic.");
  }

  // =========================
  // Shipping calculator (PUDO)
  // =========================

  // Route keys:
  // l2l = Locker to Locker
  // l2d = Locker to Door
  // l2k = Locker to Kiosk
  // k2d = Kiosk to Door
  //
  // NOTE:
  // These are your current code rates. If you want to match the newer poster rates,
  // update these values in ONE place here.
  const PUDO_PRICES = {
    M: { l2l: 69,  l2d: 109, l2k: 79,  k2d: 125 },
    L: { l2l: 89,  l2d: 156, l2k: 109, k2d: 190 },
    XL:{ l2l: 119, l2d: 209, l2k: 139, k2d: 250 }
  };

  // Conservative business packing capacity for "kit equivalents"
  // (bundle counts as 3 kits; other selected items count as 1 in current logic)
  const BOX_CAPACITY = {
    M: 1,   // 1 kit
    L: 3,   // up to 3 kits
    XL: 6   // up to 6 kits
  };

  function normalizePudoRoute(route) {
    const r = String(route || "").toLowerCase();

    const map = {
      locker_to_locker: "l2l",
      locker_to_door: "l2d",
      locker_to_kiosk: "l2k",
      kiosk_to_door: "k2d",
      l2l: "l2l",
      l2d: "l2d",
      l2k: "l2k",
      k2d: "k2d"
    };

    return map[r] || "l2l";
  }

  const DEFAULT_SHIPPING_ROUTE = normalizePudoRoute(
    CONFIG.PUDO_ROUTE || CONFIG.pudo_route || "l2l"
  );

  function routeLabel(route) {
    const r = normalizePudoRoute(route);
    return (
      {
        l2l: "Locker to Locker",
        l2d: "Locker to Door",
        l2k: "Locker to Kiosk",
        k2d: "Kiosk to Door"
      }[r] || r
    );
  }

  function getSelectedShippingRoute() {
    const routeSelect = $("#shipRoute");
    const selected = routeSelect?.value || DEFAULT_SHIPPING_ROUTE;
    return normalizePudoRoute(selected);
  }

  function getKitEquivalentCountFromCart(cartObj) {
    const items = Object.values((cartObj && cartObj.items) || {});
    let kits = 0;

    for (const it of items) {
      const qty = Number(it.qty) || 0;
      const sku = String(it.sku || it.id || "").toLowerCase();

      // Current requested rule:
      // - bundle counts as 3
      // - every other selected item counts as 1
      // (You can later upgrade this to weighted ship units for add-ons)
      if (sku === "bundle") kits += 3 * qty;
      else kits += 1 * qty;
    }

    return kits;
  }

  function getParcelCountFromBreakdown(counts) {
    return Object.values(counts || {}).reduce((a, n) => a + (Number(n) || 0), 0);
  }

  function breakdownLabel(counts) {
    const c = counts || {};
    const parts = [];
    if (c.XL) parts.push(`${c.XL} × XL`);
    if (c.L) parts.push(`${c.L} × L`);
    if (c.M) parts.push(`${c.M} × M`);
    return parts.join(" + ") || "";
  }

  function humanTierLabelFromBreakdown(counts) {
    const c = counts || {};
    const totalParcels = getParcelCountFromBreakdown(c);

    if (totalParcels === 1) {
      if (c.M === 1) return "Medium (M)";
      if (c.L === 1) return "Large (L)";
      if (c.XL === 1) return "Extra Large (XL)";
    }

    return breakdownLabel(c) || "To be confirmed";
  }

  function estimatePudoShippingByKitQty(kitQty, route = DEFAULT_SHIPPING_ROUTE) {
    const r = normalizePudoRoute(route || "l2l");
    const q = Math.max(0, Math.ceil(Number(kitQty) || 0));

    if (q <= 0) {
      return {
        ok: false,
        kitQty: 0,
        tier: null,
        route: r,
        routeLabel: routeLabel(r),
        price: 0,
        parcels: 0,
        breakdown: { M: 0, L: 0, XL: 0 },
        breakdownLabel: "",
        message: "Add items to estimate shipping."
      };
    }

    const boxOptions = ["M", "L", "XL"]
      .map((tier) => ({
        tier,
        capacity: Number(BOX_CAPACITY[tier] || 0),
        price: Number(PUDO_PRICES?.[tier]?.[r] || 0)
      }))
      .filter((b) => b.capacity > 0 && b.price > 0);

    if (!boxOptions.length) {
      return {
        ok: false,
        kitQty: q,
        tier: null,
        route: r,
        routeLabel: routeLabel(r),
        price: 0,
        parcels: 0,
        breakdown: { M: 0, L: 0, XL: 0 },
        breakdownLabel: "",
        message: "Shipping route pricing not configured."
      };
    }

    // DP (dynamic programming):
    // Find cheapest way to cover q kit-equivalents using M/L/XL boxes.
    // The final box is allowed to be partially filled.
    const dp = Array.from({ length: q + 1 }, () => null);
    dp[0] = {
      cost: 0,
      counts: { M: 0, L: 0, XL: 0 }
    };

    for (let i = 1; i <= q; i++) {
      let best = null;

      for (const box of boxOptions) {
        const prevIdx = Math.max(0, i - box.capacity);
        const prev = dp[prevIdx];
        if (!prev) continue;

        const nextCounts = { ...prev.counts };
        nextCounts[box.tier] = (nextCounts[box.tier] || 0) + 1;

        const candidate = {
          cost: prev.cost + box.price,
          counts: nextCounts
        };

        if (!best) {
          best = candidate;
          continue;
        }

        const candParcels = getParcelCountFromBreakdown(candidate.counts);
        const bestParcels = getParcelCountFromBreakdown(best.counts);

        const candidateXL = Number(candidate.counts.XL || 0);
        const bestXL = Number(best.counts.XL || 0);

        // Tie-breakers:
        // 1) lower total cost
        // 2) fewer parcels
        // 3) more XL boxes (usually easier packing/handling for bulk)
        if (
          candidate.cost < best.cost ||
          (candidate.cost === best.cost && candParcels < bestParcels) ||
          (candidate.cost === best.cost &&
            candParcels === bestParcels &&
            candidateXL > bestXL)
        ) {
          best = candidate;
        }
      }

      dp[i] = best;
    }

    const best = dp[q];
    const counts = best?.counts || { M: 0, L: 0, XL: 0 };
    const parcels = getParcelCountFromBreakdown(counts);
    const price = Number(best?.cost || 0);
    const comboLabel = breakdownLabel(counts);
    const displayTier = comboLabel || "Custom";

    return {
      ok: true,
      kitQty: q,
      tier: displayTier, // backward-compatible string field; now supports multi-box combos
      route: r,
      routeLabel: routeLabel(r),
      price,
      parcels,
      breakdown: counts,
      breakdownLabel: comboLabel,
      message: `Estimated shipping: R${price} (${displayTier}, ${routeLabel(r)}; ${parcels} parcel${parcels === 1 ? "" : "s"}). Final quote confirmed after packing and weight check.`
    };
  }

  let cart = loadCart ? loadCart() : { items: {} };
  let waCtl = null;
  let lastFocusedEl = null;

  function getCurrentShippingEstimate() {
    const kitQty = getKitEquivalentCountFromCart(cart);
    const selectedRoute = getSelectedShippingRoute();
    return estimatePudoShippingByKitQty(kitQty, selectedRoute);
  }

  function getManualShippingEstimateFromCalculatorInputs() {
    const route = getSelectedShippingRoute();
    const shipKitCountInput = $("#shipKitCount");
    const qty = Math.max(1, Number.parseInt(shipKitCountInput?.value || "1", 10) || 1);
    return estimatePudoShippingByKitQty(qty, route);
  }

  function syncShippingFields() {
    const ship = getCurrentShippingEstimate();

    const shippingEstimateField = $("#shipping_estimate");
    if (shippingEstimateField) {
      shippingEstimateField.value = ship.ok ? `R${ship.price}` : "";
    }

    const shippingTierField = $("#shipping_tier");
    if (shippingTierField) {
      shippingTierField.value = ship.ok ? String(ship.tier || "") : "";
    }

    const shippingRouteField = $("#shipping_route");
    if (shippingRouteField) {
      shippingRouteField.value = ship.ok
        ? String(ship.route || DEFAULT_SHIPPING_ROUTE)
        : DEFAULT_SHIPPING_ROUTE;
    }

    return ship;
  }

  function syncShippingCalculatorInputsFromCart() {
    const shipKitCountInput = $("#shipKitCount");
    if (!shipKitCountInput) return;

    const kitCount = getKitEquivalentCountFromCart(cart);

    // Only force-sync when there are cart items; keep manual calculator usable when cart is empty
    if (kitCount <= 0) return;

    if (String(shipKitCountInput.value) !== String(kitCount)) {
      shipKitCountInput.value = String(kitCount);

      // Trigger any other listeners (including legacy inline calculator script)
      shipKitCountInput.dispatchEvent(new Event("input", { bubbles: true }));
      shipKitCountInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function syncShippingCalculatorVisibleUI() {
    const ship = getManualShippingEstimateFromCalculatorInputs();

    // Delivery section calculator labels
    const shipTierLabelEl = $("#shipTierLabel");
    if (shipTierLabelEl) {
      shipTierLabelEl.textContent = ship.ok
        ? humanTierLabelFromBreakdown(ship.breakdown)
        : "To be confirmed";
    }

    const shipPriceLabelEl = $("#shipPriceLabel");
    if (shipPriceLabelEl) {
      shipPriceLabelEl.textContent = ship.ok ? `R${ship.price}` : "To be confirmed";
    }

    const shipRouteLabelEl = $("#shipRouteLabel");
    if (shipRouteLabelEl) {
      shipRouteLabelEl.textContent = ship.routeLabel || routeLabel(DEFAULT_SHIPPING_ROUTE);
    }

    const shipCalcNoteEl = $("#shipCalcNote");
    if (shipCalcNoteEl) {
      if (!ship.ok) {
        shipCalcNoteEl.textContent = "Add items or enter quantity to estimate shipping.";
      } else if (ship.parcels <= 1) {
        shipCalcNoteEl.textContent =
          `${humanTierLabelFromBreakdown(ship.breakdown)} estimate for ${ship.kitQty} kit${ship.kitQty === 1 ? "" : "s"}. Final shipping confirmed after packing.`;
      } else {
        shipCalcNoteEl.textContent =
          `${ship.kitQty} kit${ship.kitQty === 1 ? "" : "s"} can be split across ${ship.parcels} parcel${ship.parcels === 1 ? "" : "s"} (${ship.breakdownLabel}) to optimize shipping. Final shipping confirmed after packing.`;
      }
    }

    // Checkout summary helper text (best-effort; cart sync will keep this aligned when cart has items)
    const checkoutShippingSummary = $("#checkoutShippingSummary");
    if (checkoutShippingSummary) {
      if (!ship.ok) {
        checkoutShippingSummary.textContent =
          "Select your shipping option in the Delivery section to see an estimate. Final shipping is confirmed by email.";
      } else {
        checkoutShippingSummary.textContent =
          `Estimated shipping: R${ship.price} (${ship.breakdownLabel || humanTierLabelFromBreakdown(ship.breakdown)}, ${ship.routeLabel}; ${ship.parcels} parcel${ship.parcels === 1 ? "" : "s"}). Final shipping is confirmed by email quote based on packed box size and add-ons.`;
      }
    }
  }

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
      itemsWrap.innerHTML = items
        .map((it) => {
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
        })
        .join("");
    }

    const subEl = $("#cartSubtotal");
    if (subEl) subEl.textContent = formatMoney ? formatMoney(subtotal) : String(subtotal);

    // Keep hidden cart field up to date (Formspree fallback / auditing / backend compatibility)
    const cartJson = $("#cart_json");
    if (cartJson) cartJson.value = JSON.stringify(getCartItemsForQuote());

    // Keep shipping calculator input (How many kits?) synced to cart selections
    syncShippingCalculatorInputsFromCart();

    // Shipping estimate sync + UI (cart-based, quote-safe)
    const ship = syncShippingFields();

    // Also keep the visible delivery calculator panel smart (manual/cart synced)
    syncShippingCalculatorVisibleUI();

    const shipAmtEl = $("#cartShippingEstimate");
    if (shipAmtEl) {
      shipAmtEl.textContent = ship.ok ? `R${ship.price}` : "TBC";
    }

    const shipNoteEl = $("#cartShippingNote");
    if (shipNoteEl) {
      if (ship.ok) {
        const kitCount = getKitEquivalentCountFromCart(cart);
        const combo = ship.breakdownLabel || ship.tier;
        shipNoteEl.textContent =
          `${combo} • ${ship.routeLabel} • ${ship.parcels} parcel${ship.parcels === 1 ? "" : "s"}. Based on ${kitCount} item${kitCount === 1 ? "" : "s"} (bundle counts as 3). Final quote confirmed after packing and weight check.`;
      } else {
        shipNoteEl.textContent =
          "Shipping estimate appears when you add items. Bundle counts as 3 items for shipping estimate.";
      }
    }

    // Backward-compatible fallback shipping note (if you didn't add IDs)
    let fallbackShipEl = $("#shippingEstimate");
    if (!shipAmtEl && !shipNoteEl) {
      if (!fallbackShipEl) {
        fallbackShipEl = document.createElement("div");
        fallbackShipEl.id = "shippingEstimate";
        fallbackShipEl.className = "fine";
        const drawerSummary = document.querySelector(".drawerSummary");
        if (drawerSummary) drawerSummary.appendChild(fallbackShipEl);
      }
      fallbackShipEl.textContent = ship.ok
        ? `${ship.message} Bundle counts as 3 items for shipping estimate.`
        : "Shipping estimate will appear when you add items.";
    }

    // Update checkout CTA text
    const checkoutBtn = $("#checkoutBtn");
    if (checkoutBtn) {
      checkoutBtn.textContent =
        items.length && formatMoney ? `Checkout • ${formatMoney(subtotal)}` : "Checkout • Get Quote";
    }

    // Keep WhatsApp link synced
    waCtl?.updateWA?.();
  }

  /* ---------- Drawer open/close ---------- */
  function openDrawer() {
    const d = $("#cartDrawer");
    if (!d) return;

    lastFocusedEl = document.activeElement;
    d.dataset.open = "true";
    d.setAttribute("aria-hidden", "false");

    const cartBtn = $("#cartBtn");
    if (cartBtn) cartBtn.setAttribute("aria-expanded", "true");

    document.body.style.overflow = "hidden";

    const focusTarget =
      $("#cartClose") ||
      d.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (focusTarget && typeof focusTarget.focus === "function") focusTarget.focus();
  }

  function closeDrawer() {
    const d = $("#cartDrawer");
    if (!d) return;

    d.dataset.open = "false";
    d.setAttribute("aria-hidden", "true");

    const cartBtn = $("#cartBtn");
    if (cartBtn) cartBtn.setAttribute("aria-expanded", "false");

    document.body.style.overflow = "";

    if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
      try {
        lastFocusedEl.focus();
      } catch {
        // no-op
      }
    }
  }

  function bindDrawer() {
    const d = $("#cartDrawer");
    if (!d) return;

    on($("#cartBtn"), "click", () => {
      renderCart();
      openDrawer();
    });

    $$("[data-open-cart], .open-cart").forEach((el) =>
      on(el, "click", (e) => {
        e.preventDefault();
        renderCart();
        openDrawer();
      })
    );

    on($("#cartClose"), "click", closeDrawer);
    on($("#cartOverlay"), "click", closeDrawer);

    on(document, "keydown", (e) => {
      if (e.key === "Escape" && d.dataset.open === "true") closeDrawer();
    });

    // Delegated actions (inc/dec/remove)
    on(d, "click", (e) => {
      const targetEl = e.target && e.target.nodeType === 1 ? e.target : e.target?.parentElement;
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

        if (!id || !name || price <= 0) return;

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
    const shipping = syncShippingFields();

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
      shipping_estimate: shipping.ok ? shipping.price : null,
      shipping_tier: shipping.ok ? shipping.tier : null,
      shipping_route: shipping.route || DEFAULT_SHIPPING_ROUTE,
      shipping_route_label: shipping.routeLabel || routeLabel(DEFAULT_SHIPPING_ROUTE),
      shipping_note: shipping.message || "",
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const payload = buildQuotePayloadFromForm();

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

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

      // Optional success note in message field
      const msgBox = $("#message");
      if (msgBox && quoteRef) {
        const marker = `Quote reference: ${quoteRef}`;
        if (!String(msgBox.value || "").includes("Quote reference:")) {
          msgBox.value = `${msgBox.value || ""}\n\nQuote sent successfully.\n${marker}`.trim();
        }
      }

      // Clear cart after successful quote
      cart = clearCart ? clearCart() : { items: {} };
      renderCart();

      closeDrawer();
      scrollToId?.("contact");
    } catch (err) {
      clearTimeout(timeoutId);
      console.error(err);

      const isAbort = err?.name === "AbortError";
      const msg = isAbort
        ? "Quote request timed out. Sending via backup form..."
        : (err?.message || "Failed to send quote");
      showToast?.(msg);

      // Backup fallback to Formspree (form action) if available
      try {
        if (form && form.action && form.action.includes("formspree.io")) {
          showToast?.("Worker blocked. Sending via backup form...");
          form.submit(); // bypasses JS listener
          return;
        }
      } catch (fallbackErr) {
        console.error("Form fallback failed:", fallbackErr);
      }
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

    const shipping = syncShippingFields();

    // Fill message box with cart summary (refresh if an older summary is already present)
    const msg = $("#message");
    if (msg && buildCartSummary) {
      const summary = buildCartSummary(cart);
      const shippingLine = shipping.ok
        ? `Estimated shipping (${shipping.routeLabel}): R${shipping.price} [${shipping.tier}] (final quote confirmed after packing and weight check)`
        : "Estimated shipping: TBC (final quote confirmed after packing and weight check)";
      const combined = `${summary}\n${shippingLine}`;

      const existing = String(msg.value || "").trim();

      if (!existing) {
        msg.value = combined;
      } else {
        const idx = existing.lastIndexOf("Order summary:");
        if (idx >= 0) {
          const before = existing.slice(0, idx).trim();
          msg.value = before ? `${before}\n\n${combined}` : combined;
        } else {
          msg.value = `${existing}\n\n${combined}`;
        }
      }
    }

    // Set dropdown to neutral value for cart checkout
    const kitSel = $("#kit");
    if (kitSel) kitSel.value = "Other";

    // Sync hidden cart JSON + shipping fields
    const cartJson = $("#cart_json");
    if (cartJson) cartJson.value = JSON.stringify(getCartItemsForQuote());
    syncShippingFields();

    closeDrawer();
    scrollToId?.("contact");
    showToast?.("Cart added to checkout");
    return true;
  }

  function bindCheckout() {
    on($("#checkoutBtn"), "click", moveCartToCheckout);

    // Product/card checkout buttons should add that product first, then continue to checkout.
    $$("[data-checkout]").forEach((btn) =>
      on(btn, "click", () => {
        const card = btn.closest(".card");
        const addBtn = card?.querySelector?.("[data-add]");

        if (addBtn?.dataset) {
          const id = addBtn.dataset.id;
          const sku = addBtn.dataset.sku || id;
          const name = addBtn.dataset.name;
          const price = Number(addBtn.dataset.price);

          if (id && name && price > 0) {
            cart = addItem ? addItem(cart, { id, sku, name, price }, 1) : cart;
            renderCart();
          }
        }

        moveCartToCheckout();
      })
    );

    on($("#copyCartBtn"), "click", async () => {
      if (!buildCartSummary) return;

      const summary = buildCartSummary(cart);
      const shipping = getCurrentShippingEstimate();
      const fullSummary = shipping.ok
        ? `${summary}\nEstimated shipping (${shipping.routeLabel}): R${shipping.price} [${shipping.tier}] (final quote confirmed after packing and weight check)`
        : summary;

      try {
        await navigator.clipboard.writeText(fullSummary);
        showToast?.("Copied order summary");
      } catch {
        const ta = document.createElement("textarea");
        ta.value = fullSummary;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.pointerEvents = "none";
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

  function bindShippingCalculatorSync() {
    const routeSelect = $("#shipRoute");
    const kitCountInput = $("#shipKitCount");

    const refresh = () => {
      // Re-render cart so drawer summary / hidden fields / copied summary stay aligned
      // and override any older inline calculator logic with the smart estimator.
      renderCart();
    };

    on(routeSelect, "change", refresh);
    on(kitCountInput, "input", refresh);
    on(kitCountInput, "change", refresh);
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
    bindShippingCalculatorSync();

    // Intercept contact form submit and send quote via backend (if configured)
    on($("#contactForm"), "submit", sendQuoteFromContactForm);

    renderCart();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();