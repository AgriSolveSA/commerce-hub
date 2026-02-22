(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function on(el, event, handler, opts) {
    if (!el) return;
    el.addEventListener(event, handler, opts);
  }

  function scrollToId(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  window.CubClubDom = { $, $$, on, scrollToId };
})();
