(() => {
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;

  const KEY = "theme";

  const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";

  const syncAria = () => {
    btn.setAttribute("aria-label", isDark() ? "切换到亮色模式" : "切换到暗色模式");
  };

  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else if (saved === "light") document.documentElement.removeAttribute("data-theme");
  } catch {
    /* ignore */
  }

  syncAria();

  btn.addEventListener("click", () => {
    const nextDark = !isDark();
    if (nextDark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem(KEY, nextDark ? "dark" : "light");
    } catch {
      /* ignore */
    }
    syncAria();
    window.dispatchEvent(new CustomEvent("layout-refit"));
  });
})();
