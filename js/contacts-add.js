(() => {
  const card = document.querySelector(".leftCol .card:first-child");
  const modal = document.getElementById("addContactModal");
  if (!card || !modal) return;

  const addBtn = card.querySelector("#addContactBtn");
  const form = modal.querySelector("#addContactForm");
  const nameInput = modal.querySelector("#addContactName");
  const errorEl = modal.querySelector("#addContactError");
  const hintEl = modal.querySelector("#addContactCategoryHint");
  const list = card.querySelector(".list");
  const tabs = Array.from(card.querySelectorAll(".tabs .tab[data-filter]"));

  if (!addBtn || !form || !nameInput || !errorEl || !list || !tabs.length) return;

  const panel = modal.querySelector(".addContactModal__panel");

  const STORAGE_KEY = "extraContacts";

  /** 将弹窗贴在联系人卡片右侧（空间不够则改到左侧），并限制在视口内 */
  const positionPanel = () => {
    if (modal.hidden || !panel) return;
    const r = card.getBoundingClientRect();
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = panel.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : Math.min(400, vw - 40);
    const h = rect.height > 0 ? rect.height : 240;

    let left = r.right + margin;
    if (left + w > vw - margin) {
      left = r.left - w - margin;
    }
    left = Math.min(Math.max(margin, left), Math.max(margin, vw - w - margin));

    let top = r.top;
    if (top + h > vh - margin) {
      top = vh - h - margin;
    }
    top = Math.min(Math.max(margin, top), Math.max(margin, vh - h - margin));

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  };

  const positionPanelIfOpen = () => {
    if (!modal.hidden) positionPanel();
  };

  const getActiveFilter = () => {
    const t = tabs.find((x) => x.classList.contains("isActive")) || tabs[0];
    return t.getAttribute("data-filter") || "family";
  };

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const save = (arr) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch {}
  };

  const renderRow = ({ name, category }) => {
    const row = document.createElement("div");
    row.className = "row";
    row.setAttribute("data-category", category);
    row.setAttribute("data-name", name);
    row.innerHTML = `
      <div class="avatar">
        <span class="avatar__ring"></span>
      </div>
      <div class="row__body">
        <div class="row__top">
          <div class="row__name"></div>
          <div class="row__meta">--:--</div>
        </div>
        <div class="row__sub">暂无消息记录，请开始聊天吧！</div>
      </div>
    `;
    const nameEl = row.querySelector(".row__name");
    if (nameEl) nameEl.textContent = name;
    return row;
  };

  const bootstrap = () => {
    const extras = load();
    extras.forEach((c) => list.appendChild(renderRow(c)));
    window.dispatchEvent(new CustomEvent("contacts:updated"));
  };

  const refit = () => requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("layout-refit")));

  const openModal = () => {
    const t = tabs.find((x) => x.classList.contains("isActive")) || tabs[0];
    const label = (t.textContent || "").trim();
    if (hintEl) hintEl.textContent = label ? `将添加到「${label}」分组` : "";
    errorEl.textContent = "";
    nameInput.value = "";
    modal.hidden = false;
    addBtn.setAttribute("aria-expanded", "true");
    refit();
    requestAnimationFrame(() => {
      positionPanel();
      requestAnimationFrame(() => {
        positionPanel();
        nameInput.focus();
      });
    });
  };

  const closeModal = () => {
    modal.hidden = true;
    addBtn.setAttribute("aria-expanded", "false");
    refit();
  };

  addBtn.addEventListener("click", () => openModal());

  window.addEventListener("resize", positionPanelIfOpen, { passive: true });
  window.addEventListener("layout-refit", positionPanelIfOpen);

  modal.addEventListener("click", (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (el.closest("[data-add-contact-dismiss='true']")) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) {
      e.preventDefault();
      closeModal();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      errorEl.textContent = "请输入联系人姓名";
      return;
    }
    const category = getActiveFilter();

    const extras = load();
    const exists = extras.some((c) => c.category === category && c.name === name);
    if (exists) {
      errorEl.textContent = "该联系人已存在";
      return;
    }
    extras.push({ name, category });
    save(extras);

    list.appendChild(renderRow({ name, category }));
    closeModal();
    window.dispatchEvent(new CustomEvent("contacts:updated"));
  });

  bootstrap();
})();
