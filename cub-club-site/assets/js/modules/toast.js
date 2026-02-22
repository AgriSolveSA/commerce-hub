(() => {
  let timeoutId = null;

  function showToast(message, ms = 1600) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.dataset.show = "true";
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      el.dataset.show = "false";
    }, ms);
  }

  window.CubClubToast = { showToast };
})();
