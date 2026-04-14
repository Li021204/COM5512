(() => {
  const chatView = document.getElementById("chatView");
  const settingsView = document.getElementById("settingsView");
  const navHome = document.getElementById("navHome");
  const navQuick = document.getElementById("navQuick");
  const navChat = document.getElementById("navChat");
  const navContacts = document.getElementById("navContacts");
  const navSettings = document.getElementById("navSettings");
  const crumb = document.getElementById("settingsCrumb");
  const content = document.getElementById("settingsContent");
  const contactsCard = document.getElementById("contactsCard");
  const featuresCard = document.getElementById("featuresCard");
  const settingsLeft = document.getElementById("settingsLeft");
  const homeView = document.getElementById("homeView");
  const quickView = document.getElementById("quickView");
  const contactsView = document.getElementById("contactsView");
  const chatShell = document.getElementById("chatShell");
  const navItems = Array.from(document.querySelectorAll(".settingsNav__item[data-settings-top]"));
  const navIcons = Array.from(document.querySelectorAll(".sidebar__nav .navIcon[data-view]"));

  let homeAlignedOnce = false;
  let homeAlignRaf = 0;
  let homeAskTimer = 0;

  const stopHomeAskTypewriter = () => {
    if (homeAskTimer) {
      clearTimeout(homeAskTimer);
      homeAskTimer = 0;
    }
  };

  const startHomeAskTypewriter = () => {
    if (!homeView || homeView.hidden) return;
    const el = document.getElementById("homeAsk");
    if (!(el instanceof HTMLElement)) return;
    const full = el.getAttribute("data-text") || el.textContent || "";
    const text = String(full || "").trim();
    if (!text) return;

    stopHomeAskTypewriter();
    el.textContent = "";
    el.setAttribute("aria-label", text);

    let i = 0;
    const tick = () => {
      if (!homeView || homeView.hidden) return stopHomeAskTypewriter();
      i += 1;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        homeAskTimer = 0;
        return;
      }
      homeAskTimer = window.setTimeout(tick, 90);
    };
    // small delay so it feels intentional, but still immediate
    homeAskTimer = window.setTimeout(tick, 140);
  };

  const syncHomeBottomAlign = () => {
    const root = document.documentElement;
    if (!homeView || homeView.hidden) return;
    const fontBtn = document.getElementById("fontToggleBtn");
    const homeBottom = homeView.querySelector(".homeBottom");
    const composer = homeView.querySelector(".homeComposer");
    if (!(fontBtn instanceof HTMLElement) || !(homeBottom instanceof HTMLElement) || !(composer instanceof HTMLElement)) return;
    const wantTop = fontBtn.getBoundingClientRect().top;
    const curTop = composer.getBoundingClientRect().top;
    const raw = Math.round(wantTop - curTop);
    // Clamp to avoid overlap; allow up/down to guarantee alignment.
    const shift = Math.max(-800, Math.min(800, raw));
    root.style.setProperty("--homeBottomShiftPx", `${shift}px`);

    // Also apply inline transform to guarantee effect even if CSS var is overridden.
    homeBottom.style.transform = `translateY(${shift}px)`;
    root.classList.add("isHomeAligned");
    homeAlignedOnce = true;

    // Optional debug overlay (off by default)
    try {
      const params = new URLSearchParams(location.search);
      const enabled =
        params.get("debugHomeAlign") === "1" ||
        params.get("debug") === "homeAlign" ||
        localStorage.getItem("debugHomeAlign") === "1";

      const existing = document.getElementById("homeAlignDebug");
      if (!enabled) {
        if (existing) existing.remove();
        return;
      }

      let dbg = existing;
      if (!(dbg instanceof HTMLElement)) {
        dbg = document.createElement("div");
        dbg.id = "homeAlignDebug";
        dbg.style.cssText =
          "position:fixed;left:76px;bottom:12px;z-index:9999;padding:8px 10px;border-radius:10px;" +
          "background:rgba(0,0,0,.55);color:#fff;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;" +
          "white-space:pre;pointer-events:none;";
        document.body.appendChild(dbg);
      }
      const canvas = document.getElementById("fitCanvas");
      const t = canvas ? getComputedStyle(canvas).transform : "";
      dbg.textContent = `homeAlign\\nwantTop=${Math.round(wantTop)} curTop=${Math.round(curTop)}\\nraw=${raw} shift=${shift}\\nfitCanvas=${t || "none"}`;
    } catch {}
  };

  const scheduleHomeAlign = ({ force = false } = {}) => {
    if (!homeView || homeView.hidden) return;
    if (homeAlignRaf) cancelAnimationFrame(homeAlignRaf);
    homeAlignRaf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        homeAlignRaf = 0;
        if (!force && homeAlignedOnce) return;
        syncHomeBottomAlign();
      });
    });
  };

  // Always keep home alignment up-to-date (works even if this page doesn't have settings panels).
  window.addEventListener("resize", () => scheduleHomeAlign({ force: true }));
  window.addEventListener("layout-refit", () => scheduleHomeAlign({ force: true }));
  window.addEventListener("load", () => scheduleHomeAlign({ force: true }));
  try {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => scheduleHomeAlign({ force: true })).catch(() => {});
    }
  } catch {}

  // If this page doesn't include settings views, stop here (home alignment still works).
  if (!chatView || !settingsView) return;

  const syncStageHeaderHeightVar = () => {
    const stage = document.querySelector(".stage");
    if (!stage) return;
    const st = stage.getBoundingClientRect();
    const sv = settingsView.getBoundingClientRect();
    const offset = Math.max(0, Math.round(sv.top - st.top));
    const panelH = Math.max(200, 800 - offset);
    document.documentElement.style.setProperty("--settingsLeftPadTop", `${offset}px`);
    document.documentElement.style.setProperty("--settingsPanelHpx", `${panelH}px`);
  };

  let stageObs = null;
  const ensureStageObserver = () => {
    if (stageObs) return;
    const sh = document.querySelector(".stageHeader");
    if (!sh || !window.MutationObserver) return;
    stageObs = new MutationObserver(() => {
      // Date/time updates can change header height (wrap).
      syncStageHeaderHeightVar();
    });
    stageObs.observe(sh, { subtree: true, childList: true, characterData: true, attributes: true });
  };

  const setView = (view) => {
    const v =
      view === "chat" || view === "settings" || view === "home" || view === "quick" || view === "contacts" ? view : "home";
    const isSettings = v === "settings";
    const isChatShell = v === "chat" || v === "settings";
    const isQuick = v === "quick";
    const isContacts = v === "contacts";

    if (homeView) homeView.hidden = v !== "home";
    if (quickView) quickView.hidden = !isQuick;
    if (contactsView) contactsView.hidden = !isContacts;
    if (chatShell) chatShell.hidden = !isChatShell;
    if (v !== "home") stopHomeAskTypewriter();

    // Inside chat shell, settings toggles the right panel and left nav.
    settingsView.hidden = !isSettings;
    chatView.hidden = isSettings;
    if (contactsCard) contactsCard.hidden = isSettings;
    if (featuresCard) featuresCard.hidden = isSettings;
    if (settingsLeft) settingsLeft.hidden = !isSettings;
    document.documentElement.classList.toggle("isSettingsView", isSettings);
    if (isSettings) {
      // Allow layout to settle, then measure.
      requestAnimationFrame(() => {
        syncStageHeaderHeightVar();
        ensureStageObserver();
      });
    }
    if (v === "home") {
      // Align once, then keep stable (avoid visible "jump" on entry).
      homeAlignedOnce = false;
      document.documentElement.classList.remove("isHomeAligned");
      scheduleHomeAlign({ force: true });
      startHomeAskTypewriter();
    }
    navIcons.forEach((a) => a.classList.toggle("isActive", a.getAttribute("data-view") === v));

    try {
      window.dispatchEvent(new CustomEvent("view:change", { detail: { view: v } }));
    } catch {}
  };

  window.addEventListener("resize", () => {
    if (document.documentElement.classList.contains("isSettingsView")) syncStageHeaderHeightVar();
  });

  window.addEventListener("layout-refit", () => {
    if (document.documentElement.classList.contains("isSettingsView")) {
      requestAnimationFrame(() => syncStageHeaderHeightVar());
    }
  });

  const DATA = {
    account: {
      title: "账号设置",
      groups: [
        {
          title: "我的账号",
          items: [
            { label: "当前账号", type: "text", value: () => (window.__USER__?.nickname ? String(window.__USER__.nickname) : "—") },
            { label: "生日", type: "text", value: () => (window.__USER__?.birthday ? String(window.__USER__.birthday) : "—") },
            { label: "登录状态", type: "badge", value: () => (localStorage.getItem("currentUser") ? "已登录" : "未登录") },
          ],
        },
        {
          title: "已绑定的子女账号",
          items: [
            {
              type: "list",
              key: "account_children",
              emptyText: "暂无绑定的子女账号",
              getRows: (state) => state.account_children || [],
              rowTitle: (r) => r.name,
              rowSub: (r) => r.id,
              btnText: () => "解绑",
              btnStyle: "danger",
              onClick: (state, row) => {
                const next = { ...state };
                next.account_children = (next.account_children || []).filter((x) => x.id !== row.id);
                return next;
              },
            },
          ],
        },
        {
          title: "登录设备管理",
          items: [
            {
              type: "list",
              key: "account_devices",
              emptyText: "暂无已登录设备",
              getRows: (state) => state.account_devices || [],
              rowTitle: (r) => r.name,
              rowSub: (r) => r.last,
              btnText: () => "取消授权",
              btnStyle: "danger",
              onClick: (state, row) => {
                const next = { ...state };
                next.account_devices = (next.account_devices || []).filter((x) => x.id !== row.id);
                return next;
              },
            },
          ],
        },
        {
          title: "账号操作",
          items: [
            { label: "切换用户", type: "action", actionId: "openUserModal", hint: "登录/注册/退出" },
            { label: "退出当前账号", type: "action", actionId: "logoutCurrent", hint: "退出后需要重新登录" },
          ],
        },
      ],
    },
    network: {
      title: "网络设置",
      groups: [
        {
          title: "可用网络列表",
          items: [
            {
              type: "list",
              key: "net_list",
              emptyText: "未发现可用网络",
              getRows: (state) => state.net_list || [],
              rowTitle: (r) => r.ssid,
              rowSub: (r) => (r.connected ? "已连接" : "可用"),
              btnText: (r) => (r.connected ? "断开" : "连接"),
              btnStyle: (r) => (r.connected ? "danger" : "primary"),
              onClick: (state, row) => {
                const next = { ...state };
                next.net_list = (next.net_list || []).map((x) => {
                  if (x.ssid !== row.ssid) return { ...x, connected: false };
                  return { ...x, connected: !x.connected };
                });
                return next;
              },
            },
          ],
        },
        {
          title: "网络状态",
          items: [
            { label: "当前状态", type: "badge", value: () => (navigator.onLine ? "在线" : "离线") },
            {
              label: "已连接网络",
              type: "text",
              value: () => {
                try {
                  const s = loadState();
                  const c = (s.net_list || []).find((x) => x.connected);
                  return c ? c.ssid : "—";
                } catch {
                  return "—";
                }
              },
            },
          ],
        },
        {
          title: "代理（可选）",
          items: [{ label: "代理地址", type: "input", key: "net_proxy", placeholder: "http://127.0.0.1:7890" }],
        },
      ],
    },
    xq: {
      title: "小乔设置",
      groups: [
        {
          title: "输入方式",
          items: [
            { label: "语音输入", type: "toggle", key: "xq_voice_input", defaultValue: true, hint: "开启后可使用麦克风输入" },
          ],
        },
        {
          title: "语音唤醒",
          items: [{ label: "语音唤醒", type: "toggle", key: "xq_voice_wake", defaultValue: false, hint: "说“小乔小乔”唤醒（演示）" }],
        },
        {
          title: "对话体验",
          items: [
            { label: "语气更温柔", type: "toggle", key: "xq_soft_tone", defaultValue: true },
            { label: "回复更简短", type: "toggle", key: "xq_short", defaultValue: false },
          ],
        },
      ],
    },
    general: {
      title: "通用设置",
      groups: [
        {
          title: "外观",
          items: [
            { label: "暗色模式", type: "action", actionId: "toggleTheme", hint: "跟随右侧按钮" },
            { label: "字体大小", type: "action", actionId: "toggleFont", hint: "跟随左下角“字”按钮" },
            { label: "更换聊天背景", type: "action", actionId: "changeChatBg", hint: "上传图片后自动应用到首页聊天区" },
            { label: "恢复默认背景", type: "action", actionId: "resetChatBg", hint: "恢复为默认插画背景" },
          ],
        },
        {
          title: "聊天",
          items: [{ label: "清空当前聊天", type: "action", actionId: "clearChat", hint: "只影响当前会话" }],
        },
      ],
    },
    a11y: {
      title: "无障碍设置",
      groups: [
        {
          title: "阅读辅助",
          items: [
            { label: "更高对比度", type: "toggle", key: "a11y_contrast", defaultValue: false, hint: "提高文字清晰度" },
            { label: "减少动效", type: "toggle", key: "a11y_reduce_motion", defaultValue: false, hint: "减少动画" },
          ],
        },
        {
          title: "语音辅助",
          items: [
            {
              label: "语音朗读",
              type: "toggle",
              key: "a11y_voice_read",
              defaultValue: false,
              hint: "开启后自动朗读重要信息（演示）",
            },
            {
              label: "视障关爱模式",
              type: "toggle",
              key: "a11y_care_mode",
              defaultValue: false,
              hint: "开启后强制打开语音唤醒与语音朗读",
            },
          ],
        },
      ],
    },
  };

  const LS_KEY = "settings__v1";
  const normalizeState = (s) => {
    const next = { ...(s || {}) };

    // Seed defaults for demo
    if (!Array.isArray(next.account_children)) {
      next.account_children = [
        { id: "child_001", name: "小李（儿子）" },
        { id: "child_002", name: "小王（女儿）" },
      ];
    }
    if (!Array.isArray(next.account_devices)) {
      next.account_devices = [
        { id: "dev_001", name: "iPhone 15", last: "最近登录：今天 16:20" },
        { id: "dev_002", name: "MacBook Air", last: "最近登录：昨天 21:05" },
      ];
    }
    if (!Array.isArray(next.net_list)) {
      next.net_list = [
        { ssid: "Silverbridge-WiFi", connected: true },
        { ssid: "邻居家网络", connected: false },
        { ssid: "CMCC-Home", connected: false },
      ];
    }

    // Accessibility care mode forces voice features on.
    if (next.a11y_care_mode) {
      next.xq_voice_wake = true;
      next.a11y_voice_read = true;
    }
    return next;
  };

  const loadState = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {};
      return normalizeState(raw);
    } catch {
      return normalizeState({});
    }
  };
  const saveState = (s) => {
    try {
      const next = normalizeState(s || {});
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("settings:v1", { detail: next }));
    } catch {}
  };

  const render = (topKey) => {
    const cfg = DATA[topKey] || DATA.account;
    if (crumb) crumb.textContent = cfg.title;
    if (!content) return;
    const state = loadState();

    const groupHtml = cfg.groups
      .map((g) => {
        const itemsHtml = g.items
          .map((it) => {
            const id = `${topKey}__${it.key || it.actionId || it.label}`;
            if (it.type === "text") {
              const v = typeof it.value === "function" ? it.value() : String(it.value || "");
              return `<div class="setRow"><div class="setRow__k">${it.label}</div><div class="setRow__v">${escapeHtml(v)}</div></div>`;
            }
            if (it.type === "badge") {
              const v = typeof it.value === "function" ? it.value() : String(it.value || "");
              return `<div class="setRow"><div class="setRow__k">${it.label}</div><div class="setBadge">${escapeHtml(v)}</div></div>`;
            }
            if (it.type === "toggle") {
              const cur = state[it.key] ?? it.defaultValue ?? false;
              const hint = it.hint ? `<div class="setRow__hint">${escapeHtml(it.hint)}</div>` : "";
              return `
                <div class="setRow setRow--toggle">
                  <div class="setRow__k">
                    <div>${it.label}</div>
                    ${hint}
                  </div>
                  <label class="setSwitch">
                    <input type="checkbox" data-toggle-key="${escapeHtml(it.key)}" ${cur ? "checked" : ""} />
                    <span class="setSwitch__ui" aria-hidden="true"></span>
                  </label>
                </div>
              `;
            }
            if (it.type === "input") {
              const cur = state[it.key] ?? "";
              const hint = it.hint ? `<div class="setRow__hint">${escapeHtml(it.hint)}</div>` : "";
              return `
                <div class="setRow setRow--input">
                  <div class="setRow__k">
                    <div>${it.label}</div>
                    ${hint}
                  </div>
                  <input class="setInput" data-input-key="${escapeHtml(it.key)}" value="${escapeHtml(String(cur))}" placeholder="${escapeHtml(
                it.placeholder || ""
              )}" />
                </div>
              `;
            }
            if (it.type === "list") {
              const rows = (typeof it.getRows === "function" ? it.getRows(state) : []) || [];
              if (!rows.length) return `<div class="setEmpty">${escapeHtml(it.emptyText || "暂无数据")}</div>`;
              return rows
                .map((row) => {
                  const title = typeof it.rowTitle === "function" ? it.rowTitle(row) : "";
                  const sub = typeof it.rowSub === "function" ? it.rowSub(row) : "";
                  const btnText = typeof it.btnText === "function" ? it.btnText(row, state) : String(it.btnText || "操作");
                  const bs = typeof it.btnStyle === "function" ? it.btnStyle(row, state) : it.btnStyle || "primary";
                  const cls = bs === "danger" ? "setBtn setBtn--danger" : bs === "primary" ? "setBtn setBtn--primary" : "setBtn";
                  const payload = encodeURIComponent(JSON.stringify({ topKey, listKey: it.key, row }));
                  return `
                    <div class="setRow setRow--list">
                      <div class="setRow__k">
                        <div>${escapeHtml(title)}</div>
                        ${sub ? `<div class="setRow__hint">${escapeHtml(sub)}</div>` : ""}
                      </div>
                      <button class="${cls}" type="button" data-list-payload="${payload}">${escapeHtml(btnText)}</button>
                    </div>
                  `;
                })
                .join("");
            }
            // action
            const hint = it.hint ? `<div class="setRow__hint">${escapeHtml(it.hint)}</div>` : "";
            return `
              <button class="setAction" type="button" data-action-id="${escapeHtml(it.actionId || "")}">
                <div class="setAction__k">
                  <div class="setAction__title">${it.label}</div>
                  ${hint}
                </div>
                <div class="setAction__chev" aria-hidden="true">›</div>
              </button>
            `;
          })
          .join("");
        return `
          <div class="setGroup">
            <div class="setGroup__title">${escapeHtml(g.title)}</div>
            <div class="setGroup__body">${itemsHtml}</div>
          </div>
        `;
      })
      .join("");

    content.innerHTML = groupHtml;

    // bind toggles / inputs / actions
    content.querySelectorAll("input[data-toggle-key]").forEach((el) => {
      el.addEventListener("change", () => {
        const k = el.getAttribute("data-toggle-key");
        if (!k) return;
        const next = loadState();
        next[k] = el.checked;
        saveState(next);
        applyA11y(next);
        // If care mode is enabled, force dependent toggles on and re-render.
        if (next.a11y_care_mode && (k === "a11y_care_mode" || k === "xq_voice_wake" || k === "a11y_voice_read")) {
          render(topKey);
        }
      });
    });
    content.querySelectorAll("input[data-input-key]").forEach((el) => {
      el.addEventListener("input", () => {
        const k = el.getAttribute("data-input-key");
        if (!k) return;
        const next = loadState();
        next[k] = el.value;
        saveState(next);
      });
    });
    content.querySelectorAll("button[data-action-id]").forEach((btn) => {
      btn.addEventListener("click", () => runAction(btn.getAttribute("data-action-id") || ""));
    });
    content.querySelectorAll("button[data-list-payload]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const raw = btn.getAttribute("data-list-payload");
        if (!raw) return;
        let payload = null;
        try {
          payload = JSON.parse(decodeURIComponent(raw));
        } catch {
          payload = null;
        }
        if (!payload) return;
        const cfg2 = DATA[payload.topKey];
        const state2 = loadState();
        const group = (cfg2?.groups || []).find((gg) => (gg.items || []).some((x) => x.type === "list" && x.key === payload.listKey));
        const it2 = group?.items?.find((x) => x.type === "list" && x.key === payload.listKey);
        if (!it2 || typeof it2.onClick !== "function") return;
        const next = it2.onClick(state2, payload.row);
        saveState(next);
        render(payload.topKey);
      });
    });

    applyA11y(state);
  };

  const escapeHtml = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const applyA11y = (state) => {
    const root = document.documentElement;
    root.classList.toggle("a11yHighContrast", !!state.a11y_contrast);
    root.classList.toggle("a11yReduceMotion", !!state.a11y_reduce_motion);
  };

  const runAction = (id) => {
    if (id === "toggleTheme") return document.getElementById("themeToggleBtn")?.click();
    if (id === "toggleFont") return document.getElementById("fontToggleBtn")?.click();
    if (id === "clearChat") return document.getElementById("chatClearBtn")?.click();
    if (id === "openUserModal") return document.getElementById("userMenuBtn")?.click();
    if (id === "logoutCurrent") {
      try {
        localStorage.removeItem("currentUser");
        localStorage.setItem("authLocked", "1");
      } catch {}
      window.dispatchEvent(new CustomEvent("auth:change"));
      location.reload();
    }
    if (id === "changeChatBg") return openBgPicker();
    if (id === "resetChatBg") return resetChatBg();
  };

  const CHAT_BG_KEY = "chatBgDataUrl";
  const applyChatBg = (dataUrl) => {
    const img = document.querySelector(".heroMedia__img");
    if (!(img instanceof HTMLImageElement)) return;
    if (dataUrl) {
      img.src = String(dataUrl);
      img.removeAttribute("data-default-bg");
    } else {
      // restore default
      const def = img.getAttribute("data-default-src");
      if (def) img.src = def;
    }
  };

  const ensureDefaultBgSaved = () => {
    const img = document.querySelector(".heroMedia__img");
    if (!(img instanceof HTMLImageElement)) return;
    if (!img.getAttribute("data-default-src")) img.setAttribute("data-default-src", img.src);
  };

  const openBgPicker = () => {
    ensureDefaultBgSaved();
    let picker = document.getElementById("chatBgPicker");
    if (!(picker instanceof HTMLInputElement)) {
      picker = document.createElement("input");
      picker.id = "chatBgPicker";
      picker.type = "file";
      picker.accept = "image/*";
      picker.hidden = true;
      document.body.appendChild(picker);
      picker.addEventListener("change", async () => {
        const f = picker.files && picker.files[0] ? picker.files[0] : null;
        picker.value = "";
        if (!f) return;
        // Keep it small-ish to avoid blowing up localStorage.
        if (f.size > 3_000_000) {
          alert("图片太大了（>3MB）。请换一张更小的图片。");
          return;
        }
        const dataUrl = await new Promise((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ""));
          fr.onerror = () => resolve("");
          fr.readAsDataURL(f);
        });
        if (!dataUrl) {
          alert("读取图片失败，请重试。");
          return;
        }
        try {
          localStorage.setItem(CHAT_BG_KEY, dataUrl);
        } catch {
          alert("保存失败（可能存储空间不足）。请换一张更小的图片。");
          return;
        }
        applyChatBg(dataUrl);
      });
    }
    picker.click();
  };

  const resetChatBg = () => {
    ensureDefaultBgSaved();
    try {
      localStorage.removeItem(CHAT_BG_KEY);
    } catch {}
    applyChatBg(null);
  };

  const setTopActive = (key) => {
    navItems.forEach((b) => b.classList.toggle("isActive", b.getAttribute("data-settings-top") === key));
    render(key);
  };

  // sidebar nav
  navHome?.addEventListener("click", (e) => {
    e.preventDefault();
    setView("home");
  });
  navQuick?.addEventListener("click", (e) => {
    e.preventDefault();
    setView("quick");
  });
  navChat?.addEventListener("click", (e) => {
    e.preventDefault();
    setView("chat");
  });
  navContacts?.addEventListener("click", (e) => {
    e.preventDefault();
    setView("contacts");
  });
  navSettings?.addEventListener("click", (e) => {
    e.preventDefault();
    setView("settings");
    const active = navItems.find((b) => b.classList.contains("isActive")) || navItems[0];
    setTopActive(active?.getAttribute("data-settings-top") || "account");
  });

  // first-level settings
  navItems.forEach((b) => {
    b.addEventListener("click", () => setTopActive(b.getAttribute("data-settings-top") || "account"));
  });

  // initial state: home
  setView("home");

  // ========== Quick tools widgets ==========
  const quickGrid = document.getElementById("quickGrid");
  const quickAddWidgetBtn = document.getElementById("quickAddWidgetBtn");
  const quickEditLayoutBtn = document.getElementById("quickEditLayoutBtn");
  const quickWidgetModal = document.getElementById("quickWidgetModal");
  const quickPicker = document.getElementById("quickPicker");

  const QUICK_LS_KEY = "quickWidgets__v1";
  const uid = () => `w_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;

  const loadQuickState = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(QUICK_LS_KEY) || "{}") || {};
      const widgets = Array.isArray(raw.widgets) ? raw.widgets : [];
      const data = raw.data && typeof raw.data === "object" ? raw.data : {};
      return { widgets, data };
    } catch {
      return { widgets: [], data: {} };
    }
  };
  const saveQuickState = (st) => {
    try {
      localStorage.setItem(QUICK_LS_KEY, JSON.stringify(st || {}));
    } catch {}
  };

  const widgetTitle = (type) => {
    if (type === "weather") return "当前天气";
    if (type === "notes") return "记事本";
    if (type === "meds") return "用药提醒";
    if (type === "todos") return "提醒事项";
    if (type === "calendar") return "日历";
    return "小组件";
  };

  const widgetGlyph = (type) => {
    if (type === "weather") return "☀";
    if (type === "notes") return "✎";
    if (type === "meds") return "💊";
    if (type === "todos") return "✓";
    if (type === "calendar") return "📅";
    return "◻";
  };

  const clampMonth = (y, m) => {
    // m: 1..12
    let yy = Number(y);
    let mm = Number(m);
    if (!Number.isFinite(yy) || !Number.isFinite(mm)) {
      const d = new Date();
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    }
    while (mm < 1) {
      yy -= 1;
      mm += 12;
    }
    while (mm > 12) {
      yy += 1;
      mm -= 12;
    }
    return { y: yy, m: mm };
  };

  const ymLabel = (y, m) => `${y}年${String(m).padStart(2, "0")}月`;

  // ========== Contacts manager (independent view) ==========
  const contactsAddBtn = document.getElementById("contactsAddBtn");
  const contactsSyncBtn = document.getElementById("contactsSyncBtn");
  const contactsSearchInput = document.getElementById("contactsSearchInput");
  const contactsMgrList = document.getElementById("contactsMgrList");
  const contactsMgrDetail = document.getElementById("contactsMgrDetail");

  let contactsMgrTab = "all"; // all | family | friends | groups | services
  let contactsMgrQ = "";
  let contactsMgrSelected = "";

  const readContactsFromDom = () => {
    const rows = Array.from(document.querySelectorAll("#contactsCard .list .row"));
    return rows
      .map((r) => {
        if (!(r instanceof HTMLElement)) return null;
        const name = String(r.getAttribute("data-name") || r.querySelector(".row__name")?.textContent || "").trim();
        const category = String(r.getAttribute("data-category") || "family").trim();
        const time = String(r.querySelector(".row__meta")?.textContent || "").trim();
        const last = String(r.querySelector(".row__sub")?.textContent || "").trim();
        const isActive = r.classList.contains("isActive");
        return name ? { name, category, time, last, isActive } : null;
      })
      .filter(Boolean);
  };

  const catLabel = (c) => {
    if (c === "family") return "家人";
    if (c === "friends") return "朋友";
    if (c === "groups") return "群聊";
    if (c === "services") return "服务";
    return "其他";
  };

  const badgeGlyph = (c) => {
    if (c === "groups") return "👥";
    if (c === "services") return "🛎";
    if (c === "family") return "🏠";
    if (c === "friends") return "✨";
    return "•";
  };

  const CONTACTS_HIDE_KEY = "contactsHidden__v1";
  const EXTRA_CONTACTS_KEY = "extraContacts";
  const loadHiddenContacts = () => {
    try {
      const raw = localStorage.getItem(CONTACTS_HIDE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  const saveHiddenContacts = (arr) => {
    try {
      localStorage.setItem(CONTACTS_HIDE_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch {}
  };
  const loadExtraContacts = () => {
    try {
      const raw = localStorage.getItem(EXTRA_CONTACTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  const saveExtraContacts = (arr) => {
    try {
      localStorage.setItem(EXTRA_CONTACTS_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch {}
  };

  const CONTACTS_PROFILE_KEY = "contactsProfiles__v1";
  const contactProfileKey = (name, category) =>
    JSON.stringify({ n: normalizeName(name), c: normalizeCat(category) });
  const loadProfiles = () => {
    try {
      const raw = localStorage.getItem(CONTACTS_PROFILE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  };
  const saveProfiles = (obj) => {
    try {
      localStorage.setItem(CONTACTS_PROFILE_KEY, JSON.stringify(obj && typeof obj === "object" ? obj : {}));
    } catch {}
  };
  const getProfile = (name, category) => {
    const all = loadProfiles();
    const k = contactProfileKey(name, category);
    const p = all[k] && typeof all[k] === "object" ? all[k] : {};
    return {
      remark: String(p.remark || ""),
      phone: String(p.phone || ""),
      tags: String(p.tags || ""),
      note: String(p.note || ""),
      photo: String(p.photo || ""),
    };
  };
  const setProfile = (name, category, patch) => {
    const all = loadProfiles();
    const k = contactProfileKey(name, category);
    const prev = all[k] && typeof all[k] === "object" ? all[k] : {};
    all[k] = { ...prev, ...patch };
    saveProfiles(all);
  };

  const normalizeName = (s) => String(s || "").trim();
  const normalizeCat = (s) => {
    const c = String(s || "").trim();
    return c === "family" || c === "friends" || c === "groups" || c === "services" ? c : "family";
  };

  const applyHiddenToDom = () => {
    const hidden = loadHiddenContacts();
    if (!hidden.length) return;
    const set = new Set(hidden.map((x) => JSON.stringify({ n: normalizeName(x?.name), c: normalizeCat(x?.category) })));
    document.querySelectorAll("#contactsCard .list .row[data-name][data-category]").forEach((r) => {
      if (!(r instanceof HTMLElement)) return;
      const name = normalizeName(r.getAttribute("data-name"));
      const category = normalizeCat(r.getAttribute("data-category"));
      if (set.has(JSON.stringify({ n: name, c: category }))) r.remove();
    });
  };

  const renderContactsManager = () => {
    if (!contactsView || contactsView.hidden) return;
    if (!contactsMgrList || !contactsMgrDetail) return;

    // Ensure "hidden" entries are removed from the source list too.
    applyHiddenToDom();

    const all = readContactsFromDom();
    const q = String(contactsMgrQ || "").trim().toLowerCase();
    const tab = String(contactsMgrTab || "all");

    // Update tab counts (5 categories)
    try {
      const counts = { all: all.length, family: 0, friends: 0, groups: 0, services: 0 };
      for (const x of all) {
        const c = normalizeCat(x.category);
        counts[c] += 1;
      }
      contactsView.querySelectorAll(".contactsTab[data-ctab]").forEach((b) => {
        if (!(b instanceof HTMLElement)) return;
        const k = String(b.getAttribute("data-ctab") || "all");
        const base = b.textContent ? b.textContent.replace(/\s*\(\d+\)\s*$/, "") : "";
        const n = Number(counts[k] ?? 0);
        b.textContent = `${base} (${n})`;
      });
    } catch {}

    const filtered = all.filter((x) => {
      if (tab !== "all" && x.category !== tab) return false;
      if (!q) return true;
      const hay = `${x.name} ${catLabel(x.category)} ${x.last}`.toLowerCase();
      return hay.includes(q);
    });

    if (!contactsMgrSelected) {
      const active = all.find((x) => x.isActive);
      contactsMgrSelected = active?.name || filtered[0]?.name || all[0]?.name || "";
    }
    if (contactsMgrSelected && !all.some((x) => x.name === contactsMgrSelected)) contactsMgrSelected = "";

    contactsMgrList.innerHTML =
      filtered.length === 0
        ? `<div class="contactsList__empty">没有匹配的联系人</div>`
        : filtered
            .map((x) => {
              const isSel = x.name === contactsMgrSelected;
              return `
                <button class="contactsItem ${isSel ? "isSelected" : ""}" type="button" data-cm-action="select" data-name="${encodeURIComponent(
                  x.name
                )}">
                  <div class="contactsItem__avatar" aria-hidden="true">${badgeGlyph(x.category)}</div>
                  <div class="contactsItem__body">
                    <div class="contactsItem__top">
                      <div class="contactsItem__name">${x.name}</div>
                      <div class="contactsItem__time">${x.time || ""}</div>
                    </div>
                    <div class="contactsItem__sub">${x.last || "暂无消息记录"}</div>
                    <div class="contactsItem__meta">${catLabel(x.category)}</div>
                  </div>
                </button>
              `;
            })
            .join("");

    const cur = all.find((x) => x.name === contactsMgrSelected) || null;
    if (!cur) {
      contactsMgrDetail.innerHTML = `
        <div class="card__header">
          <div class="card__title">详情</div>
        </div>
        <div class="contactsEmpty">
          <div class="contactsEmpty__title">请选择一个联系人</div>
          <div class="contactsEmpty__sub">点击左侧列表查看资料与操作。</div>
        </div>
      `;
      return;
    }

    const prof = getProfile(cur.name, cur.category);
    const displayName = prof.remark.trim() ? prof.remark.trim() : cur.name;
    contactsMgrDetail.innerHTML = `
      <div class="card__header">
        <div class="card__title">${displayName}</div>
      </div>
      <div class="contactsDetail__body">
        <div class="contactsDetail__row">
          <div class="contactsDetail__k">类别</div>
          <div class="contactsDetail__v">${catLabel(cur.category)}</div>
        </div>
        <div class="contactsDetail__row">
          <div class="contactsDetail__k">最近消息</div>
          <div class="contactsDetail__v contactsDetail__last">${cur.last || "暂无消息记录"}</div>
        </div>
        <div class="contactsDetail__section" aria-label="联系人信息">
          <div class="contactsDetail__secTitle">联系人信息</div>
          <div class="contactsFields">
            <label class="contactsField">
              <div class="contactsField__k">备注名</div>
              <input class="contactsField__input" data-cm-field="remark" data-name="${encodeURIComponent(
                cur.name
              )}" data-cat="${encodeURIComponent(cur.category)}" value="${prof.remark.replace(/"/g, "&quot;")}" placeholder="例如：儿子 / 王医生" />
            </label>
            <label class="contactsField">
              <div class="contactsField__k">电话</div>
              <input class="contactsField__input" data-cm-field="phone" data-name="${encodeURIComponent(
                cur.name
              )}" data-cat="${encodeURIComponent(cur.category)}" value="${prof.phone.replace(/"/g, "&quot;")}" placeholder="输入电话号码" />
            </label>
            <label class="contactsField">
              <div class="contactsField__k">标签</div>
              <input class="contactsField__input" data-cm-field="tags" data-name="${encodeURIComponent(
                cur.name
              )}" data-cat="${encodeURIComponent(cur.category)}" value="${prof.tags.replace(/"/g, "&quot;")}" placeholder="用逗号分隔，如：家人,紧急" />
            </label>
            <label class="contactsField">
              <div class="contactsField__k">备注</div>
              <textarea class="contactsField__textarea" rows="3" data-cm-field="note" data-name="${encodeURIComponent(
                cur.name
              )}" data-cat="${encodeURIComponent(cur.category)}" placeholder="补充信息…">${prof.note || ""}</textarea>
            </label>
            <div class="contactsField">
              <div class="contactsField__k">照片</div>
              <div class="contactsPhotoRow">
                <div class="contactsPhoto ${prof.photo ? "hasPhoto" : ""}">
                  ${prof.photo ? `<img class="contactsPhoto__img" src="${prof.photo}" alt="" />` : `<div class="contactsPhoto__ph">未设置</div>`}
                </div>
                <div class="contactsPhotoBtns">
                  <button class="setBtn" type="button" data-cm-action="photo-set" data-name="${encodeURIComponent(
                    cur.name
                  )}" data-cat="${encodeURIComponent(cur.category)}">选择照片</button>
                  <button class="setBtn setBtn--danger" type="button" data-cm-action="photo-clear" data-name="${encodeURIComponent(
                    cur.name
                  )}" data-cat="${encodeURIComponent(cur.category)}">移除</button>
                </div>
              </div>
            </div>
          </div>
          <div class="contactsDetail__saveRow">
            <button class="setBtn setBtn--primary" type="button" data-cm-action="save-profile" data-name="${encodeURIComponent(
              cur.name
            )}" data-cat="${encodeURIComponent(cur.category)}">保存</button>
            <div class="contactsDetail__hint" style="margin:0">这些信息仅保存在本机浏览器中。</div>
          </div>
        </div>
        <div class="contactsDetail__actions">
          <button class="setBtn setBtn--primary" type="button" data-cm-action="chat" data-name="${encodeURIComponent(cur.name)}">进入聊天</button>
          <button class="setBtn" type="button" data-cm-action="focus" data-name="${encodeURIComponent(cur.name)}">在左侧定位</button>
          <button class="setBtn setBtn--danger" type="button" data-cm-action="delete" data-name="${encodeURIComponent(
            cur.name
          )}" data-cat="${encodeURIComponent(cur.category)}">删除</button>
        </div>
        <div class="contactsDetail__hint">提示：联系人来源于当前聊天页左侧列表（家人/朋友/群聊/服务）。</div>
      </div>
    `;
  };

  contactsView?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const tabBtn = t.closest(".contactsTab");
    if (tabBtn) {
      const k = String(tabBtn.getAttribute("data-ctab") || "all");
      contactsMgrTab = k;
      contactsView.querySelectorAll(".contactsTab").forEach((b) => {
        b.classList.toggle("isActive", b === tabBtn);
        b.setAttribute("aria-selected", b === tabBtn ? "true" : "false");
      });
      renderContactsManager();
      return;
    }

    const actBtn = t.closest("[data-cm-action]");
    if (actBtn) {
      const act = String(actBtn.getAttribute("data-cm-action") || "");
      const name = decodeURIComponent(String(actBtn.getAttribute("data-name") || ""));
      const cat = decodeURIComponent(String(actBtn.getAttribute("data-cat") || ""));
      if (act === "select") {
        contactsMgrSelected = name;
        renderContactsManager();
        return;
      }
      if (act === "focus" && name) {
        // Switch to chat and focus corresponding row
        setView("chat");
        requestAnimationFrame(() => {
          const row = document.querySelector(`#contactsCard .list .row[data-name="${CSS.escape(name)}"]`);
          if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
          row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        return;
      }
      if (act === "chat" && name) {
        setView("chat");
        requestAnimationFrame(() => {
          const row = document.querySelector(`#contactsCard .list .row[data-name="${CSS.escape(name)}"]`);
          row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        return;
      }
      if (act === "save-profile" && name) {
        const category = normalizeCat(cat);
        const root = contactsMgrDetail || contactsView;
        if (!root) return;
        const pick = (k) =>
          root.querySelector(`[data-cm-field="${k}"][data-name="${encodeURIComponent(name)}"][data-cat="${encodeURIComponent(category)}"]`);
        const remarkEl = pick("remark");
        const phoneEl = pick("phone");
        const tagsEl = pick("tags");
        const noteEl = pick("note");
        const remark = remarkEl instanceof HTMLInputElement ? remarkEl.value : "";
        const phone = phoneEl instanceof HTMLInputElement ? phoneEl.value : "";
        const tags = tagsEl instanceof HTMLInputElement ? tagsEl.value : "";
        const note = noteEl instanceof HTMLTextAreaElement ? noteEl.value : "";
        setProfile(name, category, { remark, phone, tags, note });
        renderContactsManager();
        return;
      }
      if (act === "photo-clear" && name) {
        const category = normalizeCat(cat);
        setProfile(name, category, { photo: "" });
        renderContactsManager();
        return;
      }
      if (act === "photo-set" && name) {
        const category = normalizeCat(cat);
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.onchange = async () => {
          const f = inp.files && inp.files[0] ? inp.files[0] : null;
          if (!f) return;
          try {
            const dataUrl = await new Promise((resolve) => {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result || ""));
              fr.onerror = () => resolve("");
              fr.readAsDataURL(f);
            });
            if (!dataUrl) return;
            setProfile(name, category, { photo: dataUrl });
            renderContactsManager();
          } catch {}
        };
        inp.click();
        return;
      }
      if (act === "delete" && name) {
        const category = normalizeCat(cat);
        const ok = window.confirm(`确定删除「${name}」吗？（不会删除聊天记录，只会从联系人列表移除）`);
        if (!ok) return;

        // 1) Remove from DOM (source list)
        const row = document.querySelector(
          `#contactsCard .list .row[data-name="${CSS.escape(name)}"][data-category="${CSS.escape(category)}"]`
        );
        if (row instanceof HTMLElement) row.remove();

        // 2) Persist: if it's an extra contact, remove from extraContacts; otherwise add to hidden list.
        const extras = loadExtraContacts();
        const idx = extras.findIndex((x) => normalizeName(x?.name) === name && normalizeCat(x?.category) === category);
        if (idx >= 0) {
          const next = extras.slice();
          next.splice(idx, 1);
          saveExtraContacts(next);
        } else {
          const hidden = loadHiddenContacts();
          const sig = JSON.stringify({ name, category });
          const exists = hidden.some((x) => JSON.stringify({ name: normalizeName(x?.name), category: normalizeCat(x?.category) }) === sig);
          if (!exists) {
            hidden.push({ name, category });
            saveHiddenContacts(hidden);
          }
        }

        contactsMgrSelected = "";
        try {
          window.dispatchEvent(new CustomEvent("contacts:updated"));
        } catch {}
        renderContactsManager();
        return;
      }
    }
  });

  contactsSearchInput?.addEventListener("input", () => {
    if (!(contactsSearchInput instanceof HTMLInputElement)) return;
    contactsMgrQ = contactsSearchInput.value || "";
    renderContactsManager();
  });
  contactsAddBtn?.addEventListener("click", () => {
    // Reuse existing add contact modal button if present
    const btn = document.getElementById("addContactBtn");
    if (btn instanceof HTMLElement) btn.click();
  });
  contactsSyncBtn?.addEventListener("click", () => renderContactsManager());
  window.addEventListener("contacts:updated", () => renderContactsManager());

  contactsView?.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (!t.hasAttribute("data-cm-field")) return;
    // live update only in memory; persisted on Save.
  });


  // ========== Weather: city picker ==========
  const weatherCityModal = document.getElementById("weatherCityModal");
  const weatherCityQuery = document.getElementById("weatherCityQuery");
  const weatherCitySearchBtn = document.getElementById("weatherCitySearchBtn");
  const weatherCityResults = document.getElementById("weatherCityResults");
  const weatherCityUseGeoBtn = document.getElementById("weatherCityUseGeoBtn");
  let weatherCityForWid = "";

  const closeWeatherCityModal = () => {
    if (weatherCityModal) weatherCityModal.hidden = true;
    weatherCityForWid = "";
    if (weatherCityResults) weatherCityResults.innerHTML = "";
  };

  const openWeatherCityModal = (wid) => {
    weatherCityForWid = String(wid || "");
    const st = loadQuickState();
    const cur = st.data?.[weatherCityForWid]?.city?.name;
    if (weatherCityQuery instanceof HTMLInputElement) weatherCityQuery.value = String(cur || "");
    if (weatherCityModal) weatherCityModal.hidden = false;
    if (weatherCityResults) weatherCityResults.innerHTML = "";
  };

  const geocodeCity = async (q) => {
    const name = String(q || "").trim();
    if (!name) return [];
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8&language=zh&format=json`;
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    const rows = Array.isArray(data?.results) ? data.results : [];
    return rows
      .map((r) => ({
        name: String(r.name || ""),
        admin1: String(r.admin1 || ""),
        country: String(r.country || ""),
        lat: r.latitude,
        lon: r.longitude,
      }))
      .filter((r) => r.name && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)));
  };

  const renderCityResults = (rows) => {
    if (!weatherCityResults) return;
    if (!rows.length) {
      weatherCityResults.innerHTML = `<div class="quickWidget__meta">未找到结果，请换个关键词。</div>`;
      return;
    }
    weatherCityResults.innerHTML = rows
      .map((r) => {
        const sub = [r.admin1, r.country].filter(Boolean).join(" · ");
        const title = sub ? `${r.name}（${sub}）` : r.name;
        const payload = encodeURIComponent(JSON.stringify(r));
        return `
          <div class="quickListItem">
            <div class="quickListItem__text">${title}</div>
            <button class="quickSmallBtn quickSmallBtn--primary" type="button" data-q-action="city-pick" data-payload="${payload}">选择</button>
          </div>
        `;
      })
      .join("");
  };

  const doCitySearch = async () => {
    if (!(weatherCityQuery instanceof HTMLInputElement)) return;
    const q = weatherCityQuery.value.trim();
    if (!q) return;
    if (weatherCityResults) weatherCityResults.innerHTML = `<div class="quickWidget__meta">正在搜索…</div>`;
    try {
      const rows = await geocodeCity(q);
      renderCityResults(rows);
    } catch {
      if (weatherCityResults) weatherCityResults.innerHTML = `<div class="quickWidget__meta">搜索失败，请稍后再试。</div>`;
    }
  };

  weatherCityModal?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("[data-weather-city-close]")) closeWeatherCityModal();
  });
  weatherCitySearchBtn?.addEventListener("click", doCitySearch);
  weatherCityQuery?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doCitySearch();
    }
  });
  weatherCityUseGeoBtn?.addEventListener("click", () => {
    if (!weatherCityForWid) return closeWeatherCityModal();
    const st = loadQuickState();
    st.data[weatherCityForWid] = st.data[weatherCityForWid] || {};
    delete st.data[weatherCityForWid].city;
    delete st.data[weatherCityForWid].cached;
    saveQuickState(st);
    closeWeatherCityModal();
    renderQuick();
  });
  weatherCityResults?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const btn = t.closest("[data-q-action='city-pick']");
    if (!btn || !weatherCityForWid) return;
    const raw = btn.getAttribute("data-payload") || "";
    let r = null;
    try {
      r = JSON.parse(decodeURIComponent(raw));
    } catch {
      r = null;
    }
    if (!r) return;
    const st = loadQuickState();
    st.data[weatherCityForWid] = st.data[weatherCityForWid] || {};
    st.data[weatherCityForWid].city = { name: r.name, lat: r.lat, lon: r.lon };
    delete st.data[weatherCityForWid].cached;
    saveQuickState(st);
    closeWeatherCityModal();
    renderQuick();
  });

  const closeQuickModal = () => {
    if (quickWidgetModal) quickWidgetModal.hidden = true;
  };
  const openQuickModal = () => {
    if (quickWidgetModal) quickWidgetModal.hidden = false;
  };

  const weatherCodeText = (code) => {
    const c = Number(code);
    if (!Number.isFinite(c)) return "—";
    // minimal mapping
    if (c === 0) return "晴";
    if (c === 1 || c === 2) return "少云";
    if (c === 3) return "多云";
    if (c === 45 || c === 48) return "雾";
    if (c >= 51 && c <= 57) return "毛毛雨";
    if (c >= 61 && c <= 67) return "雨";
    if (c >= 71 && c <= 77) return "雪";
    if (c >= 80 && c <= 82) return "阵雨";
    if (c >= 95) return "雷雨";
    return "天气";
  };

  const weatherCodeIcon = (code) => {
    const c = Number(code);
    if (!Number.isFinite(c)) return "☁";
    if (c === 0) return "☀";
    if (c === 1 || c === 2) return "⛅";
    if (c === 3) return "☁";
    if (c === 45 || c === 48) return "🌫";
    if (c >= 51 && c <= 67) return "🌧";
    if (c >= 71 && c <= 77) return "🌨";
    if (c >= 80 && c <= 82) return "🌦";
    if (c >= 95) return "⛈";
    return "☁";
  };

  const fetchWeather = async (lat, lon) => {
    // current + today's high/low + next hours
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(
      lon
    )}&current_weather=true&hourly=temperature_2m,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&forecast_days=3&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    const cw = data && data.current_weather ? data.current_weather : null;
    if (!cw) return null;
    const dailyMaxArr = Array.isArray(data?.daily?.temperature_2m_max) ? data.daily.temperature_2m_max : [];
    const dailyMinArr = Array.isArray(data?.daily?.temperature_2m_min) ? data.daily.temperature_2m_min : [];
    const dailyCodeArr = Array.isArray(data?.daily?.weathercode) ? data.daily.weathercode : [];
    const daily = [0, 1, 2].map((i) => ({
      max: dailyMaxArr[i],
      min: dailyMinArr[i],
      code: dailyCodeArr[i],
    }));
    const hourlyTime = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
    const hourlyTemp = Array.isArray(data?.hourly?.temperature_2m) ? data.hourly.temperature_2m : [];
    const hourlyCode = Array.isArray(data?.hourly?.weathercode) ? data.hourly.weathercode : [];
    const nowIso = String(cw.time || "");
    const nowIdx = hourlyTime.indexOf(nowIso);
    const start = nowIdx >= 0 ? nowIdx : 0;
    const hours = [];
    for (let i = start; i < Math.min(start + 6, hourlyTime.length); i += 1) {
      const t = String(hourlyTime[i] || "");
      const hh = t.includes("T") ? t.split("T")[1]?.slice(0, 2) : "";
      hours.push({
        time: hh ? `${hh}时` : t,
        temp: hourlyTemp[i],
        code: hourlyCode[i],
      });
    }
    return {
      temp: cw.temperature,
      wind: cw.windspeed,
      code: cw.weathercode,
      time: cw.time,
      max: daily?.[0]?.max,
      min: daily?.[0]?.min,
      hours,
      daily,
    };
  };

  const ensureQuickSeed = () => {
    const st = loadQuickState();
    if (st.widgets.length) return;
    const w = [
      { id: uid(), type: "weather", layout: { s: 1 } },
      { id: uid(), type: "notes", layout: { s: 1 } },
      { id: uid(), type: "meds", layout: { s: 1 } },
      { id: uid(), type: "todos", layout: { s: 1 } },
    ];
    saveQuickState({ widgets: w, data: {} });
  };

  const normalizeLayout = (w) => {
    const c0 = Number(w?.layout?.c ?? w?.layout?.s ?? 1);
    const r0 = Number(w?.layout?.r ?? c0);
    const s0 = Math.max(c0, r0);
    const s = s0 >= 3 ? 3 : s0 >= 2 ? 2 : 1; // allow 1/2/3
    return { s };
  };

  const setWidgetLayout = (wid, nextLayout) => {
    const st = loadQuickState();
    st.widgets = (st.widgets || []).map((w) => {
      if (!w || w.id !== wid) return w;
      const s = normalizeLayout({ layout: nextLayout }).s;
      return { ...w, layout: { s } };
    });
    saveQuickState(st);
    renderQuick();
  };

  let isQuickEdit = false;
  const setQuickEdit = (on) => {
    isQuickEdit = !!on;
    document.documentElement.classList.toggle("isQuickEdit", isQuickEdit);
    if (quickEditLayoutBtn) quickEditLayoutBtn.textContent = isQuickEdit ? "完成" : "编辑布局";
  };

  const renderQuick = () => {
    if (!quickGrid) return;
    const st = loadQuickState();
    // Compute square cell size so 1x1 / 2x2 / 3x3 stays perfectly square.
    try {
      const cols = window.matchMedia && window.matchMedia("(max-width: 980px)").matches ? 2 : 3;
      const cs = getComputedStyle(quickGrid);
      const gap = parseFloat(cs.columnGap || cs.gap || "16") || 16;
      const w = quickGrid.clientWidth || 0;
      if (w > 0) {
        const cell = Math.floor((w - gap * (cols - 1)) / cols);
        if (cell > 80) quickGrid.style.setProperty("--quickCellPx", `${cell}px`);
      }
    } catch {}

    quickGrid.innerHTML = st.widgets
      .map((w) => {
        const t = widgetTitle(w.type);
        const g = widgetGlyph(w.type);
        const layout = normalizeLayout(w);
        const bodyId = `qb_${w.id}`;
        const sizeKey = `${layout.s}x${layout.s}`;
        return `
          <div class="quickWidget" data-wid="${w.id}" data-type="${w.type}" data-s="${layout.s}" style="grid-column: span ${layout.s}; grid-row: span ${layout.s};">
            <div class="quickWidget__head">
              <div class="quickWidget__label">
                <div class="quickWidget__icon" aria-hidden="true">${g}</div>
                <div class="quickWidget__title">${t}</div>
              </div>
              <div class="quickWidget__tools">
                <button class="quickWidget__handle" type="button" draggable="true" aria-label="拖动排序" data-q-action="drag" data-wid="${w.id}">≡</button>
                <button class="quickWidget__close" type="button" aria-label="删除" data-q-action="remove" data-wid="${w.id}">×</button>
              </div>
            </div>
            <div class="quickWidget__body" id="${bodyId}"></div>
            <div class="quickWidget__sizes" aria-label="调整大小">
              <button class="quickSizeBtn ${sizeKey === "1x1" ? "isActive" : ""}" type="button" data-q-action="size" data-size="1" data-wid="${w.id}">1×1</button>
              <button class="quickSizeBtn ${sizeKey === "2x2" ? "isActive" : ""}" type="button" data-q-action="size" data-size="2" data-wid="${w.id}">2×2</button>
              <button class="quickSizeBtn ${sizeKey === "3x3" ? "isActive" : ""}" type="button" data-q-action="size" data-size="3" data-wid="${w.id}">3×3</button>
            </div>
            <div class="quickDropHint" aria-hidden="true"></div>
          </div>
        `;
      })
      .join("");

    // Fill widget bodies
    for (const w of st.widgets) {
      const body = document.getElementById(`qb_${w.id}`);
      if (!body) continue;
      if (w.type === "notes") {
        const v = String((st.data[w.id] && st.data[w.id].text) || "");
        body.innerHTML = `<textarea class="quickTextArea" placeholder="随手记点什么…" data-q-action="notes" data-wid="${w.id}"></textarea>`;
        const ta = body.querySelector("textarea");
        if (ta) ta.value = v;
      } else if (w.type === "meds") {
        const items = Array.isArray(st.data[w.id]?.items) ? st.data[w.id].items : [];
        body.innerHTML = `
          <div class="quickRow">
            <input class="quickInput" placeholder="药名（如：降压药）" data-q-field="name" data-wid="${w.id}" />
            <input class="quickInput" style="max-width:140px" placeholder="时间（如：08:00）" data-q-field="time" data-wid="${w.id}" />
            <button class="quickSmallBtn quickSmallBtn--primary" type="button" data-q-action="med-add" data-wid="${w.id}">添加</button>
          </div>
          <ul class="quickList">
            ${items
              .map(
                (it, idx) => `
              <li class="quickListItem">
                <div class="quickListItem__text">${String(it.time || "").trim() || "—"} · ${String(it.name || "").trim() || "—"}</div>
                <button class="quickListItem__btn" type="button" data-q-action="med-del" data-wid="${w.id}" data-idx="${idx}">删除</button>
              </li>
            `
              )
              .join("")}
          </ul>
          <div class="quickWidget__meta">到点可在浏览器/系统里配合通知（演示版）。</div>
        `;
      } else if (w.type === "todos") {
        const items = Array.isArray(st.data[w.id]?.items) ? st.data[w.id].items : [];
        body.innerHTML = `
          <div class="quickRow">
            <input class="quickInput" placeholder="添加提醒事项…" data-q-field="todo" data-wid="${w.id}" />
            <button class="quickSmallBtn quickSmallBtn--primary" type="button" data-q-action="todo-add" data-wid="${w.id}">添加</button>
          </div>
          <ul class="quickList">
            ${items
              .map(
                (it, idx) => `
              <li class="quickListItem">
                <label class="quickListItem__text" style="display:flex;align-items:center;gap:10px;flex:1">
                  <input type="checkbox" data-q-action="todo-toggle" data-wid="${w.id}" data-idx="${idx}" ${it.done ? "checked" : ""} />
                  <span style="${it.done ? "text-decoration:line-through;opacity:.65" : ""}">${String(it.text || "").trim() || "—"}</span>
                </label>
                <button class="quickListItem__btn" type="button" data-q-action="todo-del" data-wid="${w.id}" data-idx="${idx}">删除</button>
              </li>
            `
              )
              .join("")}
          </ul>
        `;
      } else if (w.type === "weather") {
        const card = body.closest(".quickWidget");
        const s = card ? Number(card.getAttribute("data-s") || "1") : 1;
        const isWide = s >= 2;
        const cityName = String(st.data?.[w.id]?.city?.name || "九龙城");
        body.innerHTML = `
          <div class="wxCard ${isWide ? "wxCard--wide" : "wxCard--square"}" id="wx_${w.id}">
            <div class="wxTop">
              <button class="wxLocBtn" type="button" data-q-action="weather-city" data-wid="${w.id}" aria-label="切换城市">
                <span class="wxLoc">${cityName}</span> <span class="wxLoc__arrow">↗</span>
              </button>
              <div class="wxIcon" aria-hidden="true">☁</div>
            </div>
            <div class="wxTempRow">
              <div class="wxTemp">—°</div>
              <div class="wxCond">—</div>
            </div>
            <div class="wxHiLo">最高 —° · 最低 —°</div>
            <div class="wxHours" hidden aria-label="逐小时预报"></div>
            <div class="wxFuture" aria-label="未来两天天气">
              <div class="wxFuture__row"><span class="wxFuture__k">明天</span><span class="wxFuture__v">— / —</span><span class="wxFuture__i" aria-hidden="true">☁</span></div>
              <div class="wxFuture__row"><span class="wxFuture__k">后天</span><span class="wxFuture__v">— / —</span><span class="wxFuture__i" aria-hidden="true">☁</span></div>
            </div>
            ${!isWide ? `<button class="wxRefresh" type="button" data-q-action="weather-refresh" data-wid="${w.id}">刷新</button>` : ""}
          </div>
          ${isWide ? `<button class="quickSmallBtn" type="button" data-q-action="weather-refresh" data-wid="${w.id}" style="margin-top:10px">刷新</button>` : ""}
        `;
      } else if (w.type === "calendar") {
        const d = new Date();
        const cur = st.data[w.id]?.ym || { y: d.getFullYear(), m: d.getMonth() + 1 };
        const ym = clampMonth(cur.y, cur.m);
        // persist normalized
        if (!st.data[w.id] || !st.data[w.id].ym || st.data[w.id].ym.y !== ym.y || st.data[w.id].ym.m !== ym.m) {
          st.data[w.id] = st.data[w.id] || {};
          st.data[w.id].ym = ym;
          saveQuickState(st);
        }

        const first = new Date(ym.y, ym.m - 1, 1);
        const last = new Date(ym.y, ym.m, 0);
        const daysInMonth = last.getDate();
        // Make Monday=1..Sunday=7; JS getDay: 0=Sun..6=Sat
        const jsDay = first.getDay();
        const start = jsDay === 0 ? 7 : jsDay; // 1..7
        const blanks = start - 1;
        const today = new Date();
        const isThisMonth = today.getFullYear() === ym.y && today.getMonth() + 1 === ym.m;
        const todayDate = today.getDate();
        const labels = ["一", "二", "三", "四", "五", "六", "日"];

        const cells = [];
        for (let i = 0; i < blanks; i += 1) cells.push({ t: "", isBlank: true });
        for (let d2 = 1; d2 <= daysInMonth; d2 += 1) {
          const isToday = isThisMonth && d2 === todayDate;
          cells.push({ t: String(d2), isToday });
        }
        // pad to full weeks (multiple of 7)
        while (cells.length % 7 !== 0) cells.push({ t: "", isBlank: true });

        body.innerHTML = `
          <div class="quickCalHead">
            <button class="quickCalNav" type="button" aria-label="上个月" data-q-action="cal-prev" data-wid="${w.id}">‹</button>
            <div class="quickCalTitle">${ymLabel(ym.y, ym.m)}</div>
            <button class="quickCalNav" type="button" aria-label="下个月" data-q-action="cal-next" data-wid="${w.id}">›</button>
          </div>
          <div class="quickCalGrid" aria-label="日历">
            ${labels.map((x) => `<div class="quickCalDow">${x}</div>`).join("")}
            ${cells
              .map((c) => {
                if (c.isBlank) return `<div class="quickCalCell isBlank"></div>`;
                const cls = c.isToday ? "quickCalCell isToday" : "quickCalCell";
                return `<div class="${cls}">${c.t}</div>`;
              })
              .join("")}
          </div>
          <div class="quickWidget__meta" style="margin-top:10px">提示：可用上/下月切换（演示版）。</div>
        `;
      } else {
        body.innerHTML = `<div class="quickWidget__meta">暂不支持该组件。</div>`;
      }
    }

    // Weather: lazy fetch if visible
    const wantsWeather = st.widgets.filter((w) => w.type === "weather");
    for (const w of wantsWeather) {
      const wrap = document.getElementById(`wx_${w.id}`);
      if (!wrap) continue;
      const cached = st.data[w.id]?.cached;
      if (cached && cached.time && Date.now() - Number(cached.ts || 0) < 10 * 60 * 1000) {
        const tempEl = wrap.querySelector(".wxTemp");
        const condEl = wrap.querySelector(".wxCond");
        const iconEl = wrap.querySelector(".wxIcon");
        const hiloEl = wrap.querySelector(".wxHiLo");
        if (tempEl) tempEl.textContent = `${Math.round(Number(cached.temp))}°`;
        if (condEl) condEl.textContent = weatherCodeText(cached.code);
        if (iconEl) iconEl.textContent = weatherCodeIcon(cached.code);
        if (hiloEl) {
          const hi = Number.isFinite(Number(cached.max)) ? `${Math.round(Number(cached.max))}°` : "—°";
          const lo = Number.isFinite(Number(cached.min)) ? `${Math.round(Number(cached.min))}°` : "—°";
          hiloEl.textContent = `最高 ${hi} · 最低 ${lo}`;
        }
        // Tomorrow / day-after (daily[1], daily[2])
        const future = wrap.querySelector(".wxFuture");
        const daily = Array.isArray(cached.daily) ? cached.daily : [];
        if (future instanceof HTMLElement) {
          const rows = future.querySelectorAll(".wxFuture__row");
          const setRow = (idx, d) => {
            const row = rows[idx];
            if (!row) return;
            const v = row.querySelector(".wxFuture__v");
            const i = row.querySelector(".wxFuture__i");
            const hi = d && Number.isFinite(Number(d.max)) ? `${Math.round(Number(d.max))}°` : "—°";
            const lo = d && Number.isFinite(Number(d.min)) ? `${Math.round(Number(d.min))}°` : "—°";
            if (v) v.textContent = `${hi} / ${lo}`;
            if (i) i.textContent = weatherCodeIcon(d?.code);
          };
          setRow(0, daily[1]);
          setRow(1, daily[2]);
        }
        const hoursEl = wrap.querySelector(".wxHours");
        const hours = Array.isArray(cached.hours) ? cached.hours : [];
        if (hoursEl instanceof HTMLElement) {
          const isWide = wrap.classList.contains("wxCard--wide");
          hoursEl.hidden = !isWide || !hours.length;
          if (isWide && hours.length) {
            hoursEl.innerHTML = hours
              .slice(0, 6)
              .map((h) => {
                const tt = String(h.time || "");
                const ic = weatherCodeIcon(h.code);
                const tp = Number.isFinite(Number(h.temp)) ? `${Math.round(Number(h.temp))}°` : "—°";
                return `<div class="wxHour"><div class="wxHour__t">${tt}</div><div class="wxHour__i">${ic}</div><div class="wxHour__v">${tp}</div></div>`;
              })
              .join("");
          }
        }
      } else {
        const city = st.data?.[w.id]?.city;
        const useCity = city && Number.isFinite(Number(city.lat)) && Number.isFinite(Number(city.lon));

        if (useCity) {
          (async () => {
            try {
              const r = await fetchWeather(Number(city.lat), Number(city.lon));
              const st2 = loadQuickState();
              st2.data[w.id] = st2.data[w.id] || {};
              st2.data[w.id].cached = r
                ? { ...r, ts: Date.now() }
                : { temp: "—", wind: "—", code: NaN, ts: Date.now(), time: "", max: null, min: null, hours: [], daily: [] };
              saveQuickState(st2);
              renderQuick();
            } catch {
              const st2 = loadQuickState();
              st2.data[w.id] = st2.data[w.id] || {};
              st2.data[w.id].cached = { temp: "—", wind: "—", code: NaN, ts: Date.now(), time: "", max: null, min: null, hours: [], daily: [] };
              saveQuickState(st2);
              renderQuick();
            }
          })();
        } else {
          // fire and forget (geolocation)
          navigator.geolocation?.getCurrentPosition(
            async (pos) => {
              try {
                const r = await fetchWeather(pos.coords.latitude, pos.coords.longitude);
                const st2 = loadQuickState();
                st2.data[w.id] = st2.data[w.id] || {};
                st2.data[w.id].cached = r
                  ? { ...r, ts: Date.now() }
                  : { temp: "—", wind: "—", code: NaN, ts: Date.now(), time: "", max: null, min: null, hours: [], daily: [] };
                saveQuickState(st2);
                // Re-render for updated weather UI
                renderQuick();
              } catch {
                const st2 = loadQuickState();
                st2.data[w.id] = st2.data[w.id] || {};
                st2.data[w.id].cached = { temp: "—", wind: "—", code: NaN, ts: Date.now(), time: "", max: null, min: null, hours: [], daily: [] };
                saveQuickState(st2);
                renderQuick();
              }
            },
            () => {
              const st2 = loadQuickState();
              st2.data[w.id] = st2.data[w.id] || {};
              st2.data[w.id].cached = { temp: "—", wind: "—", code: NaN, ts: Date.now(), time: "", max: null, min: null, hours: [], daily: [] };
              saveQuickState(st2);
              renderQuick();
            },
            { enableHighAccuracy: false, maximumAge: 300000, timeout: 6000 }
          );
        }
      }
    }
  };

  const addWidget = (type) => {
    const st = loadQuickState();
    st.widgets.push({ id: uid(), type, layout: { s: 1 } });
    saveQuickState(st);
    renderQuick();
  };

  const removeWidget = (wid) => {
    const st = loadQuickState();
    st.widgets = st.widgets.filter((w) => w.id !== wid);
    if (st.data && typeof st.data === "object") delete st.data[wid];
    saveQuickState(st);
    renderQuick();
  };

  const updateWidgetData = (wid, patch) => {
    const st = loadQuickState();
    st.data[wid] = { ...(st.data[wid] || {}), ...(patch || {}) };
    saveQuickState(st);
  };

  // bind UI
  ensureQuickSeed();
  renderQuick();
  setQuickEdit(false);

  quickEditLayoutBtn?.addEventListener("click", () => setQuickEdit(!isQuickEdit));

  quickAddWidgetBtn?.addEventListener("click", () => openQuickModal());
  quickWidgetModal?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("[data-quick-widget-close]")) closeQuickModal();
  });
  quickPicker?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const btn = t.closest("[data-widget-type]");
    if (!btn) return;
    const type = String(btn.getAttribute("data-widget-type") || "").trim();
    if (!type) return;
    addWidget(type);
    closeQuickModal();
  });

  quickGrid?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const hit = t.closest("[data-q-action]");
    const act = hit?.getAttribute("data-q-action");
    const wid = hit?.getAttribute("data-wid") || "";
    if (act === "remove" && wid) return removeWidget(wid);
    if (act === "size" && wid) {
      const n = Number(hit?.getAttribute("data-size"));
      const s = n === 3 ? 3 : n === 2 ? 2 : 1;
      return setWidgetLayout(wid, { s });
    }
    if (act === "weather-city" && wid) {
      openWeatherCityModal(wid);
      return;
    }
    if (act === "weather-refresh" && wid) {
      const st = loadQuickState();
      st.data[wid] = st.data[wid] || {};
      delete st.data[wid].cached;
      saveQuickState(st);
      renderQuick();
      return;
    }
    if (act === "med-add" && wid) {
      const wrap = quickGrid.querySelector(`.quickWidget[data-wid="${CSS.escape(wid)}"]`);
      const name = wrap?.querySelector(`[data-q-field="name"][data-wid="${CSS.escape(wid)}"]`);
      const time = wrap?.querySelector(`[data-q-field="time"][data-wid="${CSS.escape(wid)}"]`);
      const nm = name instanceof HTMLInputElement ? name.value.trim() : "";
      const tm = time instanceof HTMLInputElement ? time.value.trim() : "";
      if (!nm) return;
      const st = loadQuickState();
      const items = Array.isArray(st.data[wid]?.items) ? st.data[wid].items : [];
      items.push({ name: nm, time: tm });
      updateWidgetData(wid, { items });
      renderQuick();
      return;
    }
    if (act === "med-del" && wid) {
      const idx = Number(t.getAttribute("data-idx"));
      const st = loadQuickState();
      const items = Array.isArray(st.data[wid]?.items) ? [...st.data[wid].items] : [];
      if (Number.isInteger(idx) && idx >= 0 && idx < items.length) items.splice(idx, 1);
      updateWidgetData(wid, { items });
      renderQuick();
      return;
    }
    if (act === "todo-add" && wid) {
      const wrap = quickGrid.querySelector(`.quickWidget[data-wid="${CSS.escape(wid)}"]`);
      const inp = wrap?.querySelector(`[data-q-field="todo"][data-wid="${CSS.escape(wid)}"]`);
      const txt = inp instanceof HTMLInputElement ? inp.value.trim() : "";
      if (!txt) return;
      const st = loadQuickState();
      const items = Array.isArray(st.data[wid]?.items) ? st.data[wid].items : [];
      items.push({ text: txt, done: false });
      updateWidgetData(wid, { items });
      renderQuick();
      return;
    }
    if (act === "todo-del" && wid) {
      const idx = Number(hit?.getAttribute("data-idx"));
      const st = loadQuickState();
      const items = Array.isArray(st.data[wid]?.items) ? [...st.data[wid].items] : [];
      if (Number.isInteger(idx) && idx >= 0 && idx < items.length) items.splice(idx, 1);
      updateWidgetData(wid, { items });
      renderQuick();
      return;
    }
    if ((act === "cal-prev" || act === "cal-next") && wid) {
      const st = loadQuickState();
      const cur = st.data[wid]?.ym;
      const d = new Date();
      const base = clampMonth(cur?.y ?? d.getFullYear(), cur?.m ?? d.getMonth() + 1);
      const delta = act === "cal-prev" ? -1 : 1;
      const next = clampMonth(base.y, base.m + delta);
      st.data[wid] = st.data[wid] || {};
      st.data[wid].ym = next;
      saveQuickState(st);
      renderQuick();
      return;
    }
  });

  // Drag reorder (edit mode only; drag handle is draggable)
  let dragWid = "";
  quickGrid?.addEventListener("dragstart", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (!isQuickEdit) return;
    const h = t.closest("[data-q-action='drag']");
    if (!h) return;
    const wid = String(h.getAttribute("data-wid") || "");
    if (!wid) return;
    dragWid = wid;
    try {
      e.dataTransfer?.setData("text/plain", wid);
      e.dataTransfer?.setDragImage(h, 16, 16);
      e.dataTransfer && (e.dataTransfer.effectAllowed = "move");
    } catch {}
  });
  quickGrid?.addEventListener("dragover", (e) => {
    if (!isQuickEdit) return;
    e.preventDefault();
    const t = e.target;
    if (!(t instanceof Element)) return;
    const card = t.closest(".quickWidget");
    if (!card || !(card instanceof HTMLElement)) return;
    quickGrid.querySelectorAll(".quickWidget.isDropTarget").forEach((x) => x.classList.remove("isDropTarget"));
    card.classList.add("isDropTarget");
    try {
      e.dataTransfer && (e.dataTransfer.dropEffect = "move");
    } catch {}
  });
  quickGrid?.addEventListener("dragleave", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const card = t.closest(".quickWidget");
    if (card) card.classList.remove("isDropTarget");
  });
  quickGrid?.addEventListener("drop", (e) => {
    if (!isQuickEdit) return;
    e.preventDefault();
    const t = e.target;
    if (!(t instanceof Element)) return;
    const card = t.closest(".quickWidget");
    const targetWid = card ? String(card.getAttribute("data-wid") || "") : "";
    const fromWid = dragWid || (e.dataTransfer ? e.dataTransfer.getData("text/plain") : "");
    dragWid = "";
    quickGrid.querySelectorAll(".quickWidget.isDropTarget").forEach((x) => x.classList.remove("isDropTarget"));
    if (!fromWid || !targetWid || fromWid === targetWid) return;
    const st = loadQuickState();
    const arr = Array.isArray(st.widgets) ? [...st.widgets] : [];
    const fromIdx = arr.findIndex((w) => w && w.id === fromWid);
    const toIdx = arr.findIndex((w) => w && w.id === targetWid);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    st.widgets = arr;
    saveQuickState(st);
    renderQuick();
  });

  quickGrid?.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.getAttribute("data-q-action") === "notes") {
      const wid = t.getAttribute("data-wid") || "";
      if (!wid) return;
      const v = t instanceof HTMLTextAreaElement ? t.value : "";
      updateWidgetData(wid, { text: v });
    }
  });

  quickGrid?.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.getAttribute("data-q-action") === "todo-toggle") {
      const wid = t.getAttribute("data-wid") || "";
      const idx = Number(t.getAttribute("data-idx"));
      if (!wid) return;
      const st = loadQuickState();
      const items = Array.isArray(st.data[wid]?.items) ? [...st.data[wid].items] : [];
      if (Number.isInteger(idx) && idx >= 0 && idx < items.length) {
        items[idx] = { ...items[idx], done: !!(t instanceof HTMLInputElement ? t.checked : items[idx].done) };
        updateWidgetData(wid, { items });
        renderQuick();
      }
    }
  });

  window.addEventListener("view:change", (e) => {
    const v = e && e.detail ? e.detail.view : "";
    if (v === "quick") {
      // ensure content is up-to-date when entering
      renderQuick();
    }
    if (v === "contacts") {
      renderContactsManager();
    }
  });

  // Re-fit content scale on resize (prevents scrollbars after window resize).
  window.addEventListener("resize", () => {
    try {
      if (document.getElementById("quickView")?.hidden) return;
    } catch {}
    requestAnimationFrame(() => renderQuick());
  });

  // Home -> Chat quick entry
  const homeInput = document.getElementById("homeInput");
  const homeGoBtn = document.getElementById("homeGoBtn");
  const chatInput = document.getElementById("chatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");

  const goChatWith = (text) => {
    const t = String(text || "").trim();
    // Always go to "与小乔聊天" first, then send the home input.
    setView("chat");
    requestAnimationFrame(() => {
      const want = "与小乔聊天";
      const rows = Array.from(document.querySelectorAll("#featuresCard .row"));
      const row =
        rows.find((r) => (r instanceof HTMLElement ? String(r.getAttribute("data-feature") || "").trim() === want : false)) ||
        rows.find((r) => {
          if (!(r instanceof HTMLElement)) return false;
          const nm = r.querySelector(".row__name");
          return String(nm ? nm.textContent : "").trim() === want;
        });
      if (row instanceof HTMLElement) row.click();

      // Wait one more frame so chat.js finishes switching currentContact/chatMode.
      requestAnimationFrame(() => {
        if (chatInput && t) chatInput.value = t;
        if (chatInput) chatInput.focus();
        if (t && chatSendBtn) chatSendBtn.click();
        // Clear home input after send intent.
        if (homeInput instanceof HTMLInputElement) homeInput.value = "";
      });
    });
  };

  const goChatToFeature = (featureName) => {
    const name = String(featureName || "").trim();
    setView("chat");
    requestAnimationFrame(() => {
      // Prefer to trigger existing click handler in chat.js
      const row = document.querySelector(`#featuresCard .row[data-feature="${CSS.escape(name)}"]`);
      if (row instanceof HTMLElement) row.click();
      if (chatInput) chatInput.focus();
    });
  };

  homeGoBtn?.addEventListener("click", () => goChatWith(homeInput?.value || ""));
  homeInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goChatWith(homeInput.value || "");
    }
  });
  document.getElementById("homeView")?.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const btn = t.closest("[data-home-open]");
    if (btn) {
      const k = btn.getAttribute("data-home-open") || "";
      if (k === "anti_fraud") return goChatToFeature("诈骗识别");
      if (k === "health") return goChatToFeature("健康咨询");
      if (k === "intergen") return goChatToFeature("代际沟通");
      return goChatToFeature(k);
    }
  });

  // Apply persisted chat background on load
  try {
    ensureDefaultBgSaved();
    const d = localStorage.getItem(CHAT_BG_KEY);
    if (d) applyChatBg(d);
  } catch {}
})();

