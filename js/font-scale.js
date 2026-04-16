(() => {
  const btn = document.getElementById("fontToggleBtn");
  if (!btn) return;

  const KEY = "fontScale";
  const NORMAL = 1.0;
  const LARGE = 1.5;

  const getSaved = () => {
    try {
      const v = Number(localStorage.getItem(KEY));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  };

  const setSaved = (v) => {
    try {
      localStorage.setItem(KEY, String(v));
    } catch {}
  };

  const apply = (v) => {
    document.documentElement.style.setProperty("--fontScale", String(v));
    btn.classList.toggle("isLarge", v >= (NORMAL + LARGE) / 2);
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("layout-refit")));
  };

  // initial: keep current default (CSS) unless user has chosen before
  const initial = getSaved();
  if (initial) apply(initial);
  else apply(LARGE); // current site default is large

  btn.addEventListener("click", () => {
    const current = getSaved() ?? LARGE;
    const next = current >= (NORMAL + LARGE) / 2 ? NORMAL : LARGE;
    setSaved(next);
    apply(next);
  });
})();

