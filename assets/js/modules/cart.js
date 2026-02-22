(() => {
  const CART_KEY = "cubclub_cart_v1";

  const { safeGet, safeSet } = window.CubClubStorage || {};
  const CONFIG = window.CUBCLUB_CONFIG || {};

  if (!safeGet || !safeSet) {
    // Fail loudly but safely
    console.warn("CubClubCart: storage helpers not loaded.");
  }

  /**
   * Cart shape:
   * {
   *   items: { [id]: { id, name, price, qty } },
   *   updatedAt: ISOString
   * }
   */
  function _emptyCart() {
    return { items: {}, updatedAt: new Date().toISOString() };
  }

  function loadCart() {
    return (safeGet ? safeGet(CART_KEY, _emptyCart()) : _emptyCart()) || _emptyCart();
  }

  function saveCart(cart) {
    cart.updatedAt = new Date().toISOString();
    if (safeSet) safeSet(CART_KEY, cart);
    return cart;
  }

  function clearCart() {
    return saveCart(_emptyCart());
  }

  function getItemsArray(cart) {
    return Object.values(cart.items || {});
  }

  function getCount(cart) {
    return getItemsArray(cart).reduce((sum, it) => sum + (it.qty || 0), 0);
  }

  function getSubtotal(cart) {
    return getItemsArray(cart).reduce((sum, it) => sum + (it.price * it.qty), 0);
  }

  function addItem(cart, item, qty = 1) {
    const id = item.id;
    if (!id) return cart;
    const existing = cart.items[id];
    cart.items[id] = {
      id,
      sku: item.sku || id,
      name: item.name,
      price: Number(item.price) || 0,
      qty: (existing?.qty || 0) + (Number(qty) || 1),
  };
    return saveCart(cart);
  }

  function setQty(cart, id, qty) {
    const q = Math.max(0, Number(qty) || 0);
    if (!cart.items[id]) return cart;
    if (q === 0) {
      delete cart.items[id];
    } else {
      cart.items[id].qty = q;
    }
    return saveCart(cart);
  }

  function removeItem(cart, id) {
    if (cart.items[id]) {
      delete cart.items[id];
      return saveCart(cart);
    }
    return cart;
  }

  function formatMoney(amount) {
    try {
      return new Intl.NumberFormat(CONFIG.CURRENCY_LOCALE || "en-ZA", {
        style: "currency",
        currency: CONFIG.CURRENCY || "ZAR",
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `R${Math.round(amount)}`;
    }
  }

  function buildCartSummary(cart) {
    const items = getItemsArray(cart);
    if (!items.length) return "Cart is empty.";
    const lines = [];
    lines.push(`Order summary (${CONFIG.BRAND_NAME || "Cub Club"})`);
    lines.push("--------------------------------");
    for (const it of items) {
      lines.push(`${it.qty} x ${it.name} — ${formatMoney(it.price * it.qty)}`);
    }
    lines.push("--------------------------------");
    lines.push(`Subtotal: ${formatMoney(getSubtotal(cart))}`);
    lines.push("Shipping: PUDO (paid by customer)");
    return lines.join("\n");
  }

  window.CubClubCart = {
    loadCart,
    saveCart,
    clearCart,
    getItemsArray,
    getCount,
    getSubtotal,
    addItem,
    setQty,
    removeItem,
    formatMoney,
    buildCartSummary,
  };
})();
