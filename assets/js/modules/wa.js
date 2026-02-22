(() => {
  const CONFIG = window.CUBCLUB_CONFIG || {};
  const { buildCartSummary } = window.CubClubCart || {};
  const { $, on } = window.CubClubDom || {};

  function encode(s) {
    return encodeURIComponent(String(s ?? ""));
  }

  function applyConfigToContact() {
    const form = $("#contactForm");
    if (form && CONFIG.FORMSPREE_ENDPOINT && !String(CONFIG.FORMSPREE_ENDPOINT).includes("XXXXYYYY")) {
      form.action = CONFIG.FORMSPREE_ENDPOINT;
    }

    const mail = $("#emailDirect");
    if (mail && CONFIG.SUPPORT_EMAIL && !String(CONFIG.SUPPORT_EMAIL).includes("YOUR_EMAIL")) {
      mail.href = `mailto:${encode(CONFIG.SUPPORT_EMAIL)}?subject=${encode(`${CONFIG.BRAND_NAME || "Cub Club"} Kits Enquiry`)}`;
    }
  }

  function initWhatsApp(getCart) {
    const kitSel = $("#kit");
    const pudo = $("#pudo");
    const orderref = $("#orderref");
    const msg = $("#message");
    const wa = $("#waLink");

    function updateWA() {
      if (!wa) return;
      const kit = kitSel?.value || "";
      const area = pudo?.value || "____";
      const ref = orderref?.value || "____";
      const extra = msg?.value || "";
      const cart = getCart ? getCart() : null;
      const cartText = cart && buildCartSummary ? buildCartSummary(cart) : "";
      const text =
        `Hi! I want a ${CONFIG.BRAND_NAME || "Cub Club"} order.\n` +
        (cartText && cartText !== "Cart is empty." ? `\n${cartText}\n` : "") +
        `\nKit selection: ${kit}\nArea/PUDO: ${area}\nOrder ref: ${ref}\nNotes: ${extra}`;

      const rawNumber = CONFIG.WHATSAPP_NUMBER || "YOURNUMBER";
      const number = String(rawNumber).replace(/[^\d]/g, "");
      wa.href = `https://wa.me/${number}?text=${encode(text)}`;
    }

    [kitSel, pudo, orderref, msg].forEach(el => on(el, "input", updateWA));
    [kitSel].forEach(el => on(el, "change", updateWA));
    updateWA();

    return { updateWA };
  }

  window.CubClubWA = { applyConfigToContact, initWhatsApp };
})();
