(() => {
  const tabs = Array.from(document.querySelectorAll(".tabs .tab[data-filter]"));
  const list = document.querySelector(".leftCol .card:first-child .list");
  if (!tabs.length || !list) return;

  const getRows = () => Array.from(list.querySelectorAll(".row[data-category]"));

  const scrollMemory = new Map(); // filter -> scrollTop

  const setActiveTab = (tab) => {
    tabs.forEach((t) => t.classList.toggle("isActive", t === tab));
  };

  const applyFilter = (filter) => {
    getRows().forEach((r) => {
      const cat = r.getAttribute("data-category") || "";
      r.style.display = cat === filter ? "" : "none";
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const current = tabs.find((t) => t.classList.contains("isActive"));
      const currentFilter = current ? current.getAttribute("data-filter") : null;
      if (currentFilter) scrollMemory.set(currentFilter, list.scrollTop);

      const filter = tab.getAttribute("data-filter");
      if (!filter) return;
      setActiveTab(tab);
      applyFilter(filter);

      // Restore previous scroll position for this tab; otherwise go top.
      list.scrollTop = scrollMemory.has(filter) ? scrollMemory.get(filter) : 0;
    });
  });

  // initial: use the already-active tab
  const initial = tabs.find((t) => t.classList.contains("isActive")) || tabs[0];
  setActiveTab(initial);
  applyFilter(initial.getAttribute("data-filter"));
  list.scrollTop = 0;

  window.addEventListener("contacts:updated", () => {
    const current = tabs.find((t) => t.classList.contains("isActive")) || tabs[0];
    const filter = current.getAttribute("data-filter");
    applyFilter(filter);
  });
})();

