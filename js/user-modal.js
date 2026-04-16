(() => {
  const btn = document.getElementById("userMenuBtn");
  const modal = document.getElementById("userModal");
  if (!btn || !modal) return;

  const topbarNicknameEl = document.getElementById("topbarNickname");
  const nicknameEl = document.getElementById("userNickname");
  const birthdayInput = document.getElementById("userBirthdayInput");
  const ageEl = document.getElementById("userAge");
  const avatarEl = document.getElementById("userAvatar");

  const secondaryBtn = document.getElementById("modalSecondaryBtn");
  const primaryBtn = document.getElementById("modalPrimaryBtn");

  const profileView = document.getElementById("profileView");
  const loginView = document.getElementById("loginView");

  const loginForm = document.getElementById("loginForm");
  const loginUsername = document.getElementById("loginUsername");
  const loginPassword = document.getElementById("loginPassword");
  const loginError = document.getElementById("loginError");
  const toggleRegisterBtn = document.getElementById("toggleRegisterBtn");
  const registerBirthdayRow = document.getElementById("registerBirthdayRow");
  const registerBirthday = document.getElementById("registerBirthday");

  const STORAGE_KEY = "currentUser";
  const USERDB_KEY = "userDb";
  const AUTH_LOCK_KEY = "authLocked";

  const USERS = {
    GROUP1: { password: "12345678", birthday: "2026-03-30" },
  };

  const normalizeUser = (u) => {
    const nickname = (u && u.nickname ? String(u.nickname) : "").trim();
    const birthday = (u && u.birthday ? String(u.birthday) : "").trim();
    const avatarText =
      (u && u.avatarText ? String(u.avatarText) : "").trim() ||
      (nickname ? nickname.slice(0, 1) : "U");
    return { nickname, birthday, avatarText };
  };

  const loadUser = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeUser(JSON.parse(raw));
    } catch {}
    return normalizeUser({});
  };

  const saveUser = (u) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } catch {}
  };

  const clearUser = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const setAuthLocked = (locked) => {
    try {
      if (locked) localStorage.setItem(AUTH_LOCK_KEY, "1");
      else localStorage.removeItem(AUTH_LOCK_KEY);
    } catch {}
  };

  const isAuthLocked = () => {
    try {
      return localStorage.getItem(AUTH_LOCK_KEY) === "1";
    } catch {
      return false;
    }
  };

  const isLoggedIn = (u) => Boolean(u && u.nickname);

  let currentView = "profile";
  let authMode = "login"; // "login" | "register"

  const loadUserDb = () => {
    try {
      const raw = localStorage.getItem(USERDB_KEY);
      if (raw) return JSON.parse(raw) || {};
    } catch {}
    return {};
  };

  const saveUserDb = (db) => {
    try {
      localStorage.setItem(USERDB_KEY, JSON.stringify(db));
    } catch {}
  };

  const getAllUsers = () => ({ ...USERS, ...loadUserDb() });

  const syncFooter = () => {
    if (!secondaryBtn || !primaryBtn) return;
    const u = loadUser();
    const loggedIn = isLoggedIn(u);
    const isLogin = currentView === "login";

    if (!isLogin) {
      secondaryBtn.textContent = "切换用户";
      primaryBtn.textContent = "退出登录";
      secondaryBtn.dataset.cancelBehavior = "";
      return;
    }

    secondaryBtn.textContent = "取消";
    primaryBtn.textContent = authMode === "register" ? "注册" : "登陆";
    secondaryBtn.dataset.cancelBehavior = loggedIn ? "back" : "close";

    if (registerBirthdayRow) registerBirthdayRow.hidden = authMode !== "register";
  };

  const setView = (view) => {
    const isLogin = view === "login";
    currentView = view;
    if (profileView) profileView.hidden = isLogin;
    if (loginView) loginView.hidden = !isLogin;
    if (loginError) loginError.textContent = "";
    if (isLogin) {
      authMode = "login";
      if (toggleRegisterBtn) toggleRegisterBtn.textContent = "没有账号？注册";
      if (registerBirthdayRow) registerBirthdayRow.hidden = true;
      if (loginUsername) loginUsername.value = "";
      if (loginPassword) loginPassword.value = "";
      if (registerBirthday) registerBirthday.value = "";
      if (loginUsername && typeof loginUsername.focus === "function") loginUsername.focus();
    }
    syncFooter();
  };

  const openAuthModal = (mode) => {
    setView("login");
    authMode = mode === "register" ? "register" : "login";
    if (toggleRegisterBtn) {
      toggleRegisterBtn.textContent = authMode === "register" ? "已有账号？去登陆" : "没有账号？注册";
    }
    if (registerBirthdayRow) registerBirthdayRow.hidden = authMode !== "register";
    syncFooter();
    open();
  };
  window.__openAuthModal = openAuthModal;

  const calcAge = (birthday) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthday));
    if (!m) return "—";
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const b = new Date(y, mo, d);
    if (Number.isNaN(b.getTime())) return "—";
    const now = new Date();
    let age = now.getFullYear() - y;
    const hadBirthdayThisYear =
      now.getMonth() > mo || (now.getMonth() === mo && now.getDate() >= d);
    if (!hadBirthdayThisYear) age -= 1;
    if (age < 0 || age > 130) return "—";
    return String(age);
  };

  const updateTopbar = (u) => {
    const label = isLoggedIn(u) ? u.nickname : "登陆";
    if (topbarNicknameEl) topbarNicknameEl.textContent = label;
  };

  const fill = () => {
    const u = loadUser();
    updateTopbar(u);
    if (nicknameEl) nicknameEl.textContent = isLoggedIn(u) ? u.nickname : "未登录";
    if (birthdayInput) birthdayInput.value = u.birthday || "2026-03-30";
    const birthday = birthdayInput ? birthdayInput.value : u.birthday;
    if (ageEl) ageEl.textContent = calcAge(birthday);
    if (avatarEl) avatarEl.textContent = isLoggedIn(u) ? u.avatarText : "—";
  };

  const open = () => {
    fill();
    modal.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    const closeBtn = modal.querySelector("[data-close='true']");
    if (closeBtn && typeof closeBtn.focus === "function") closeBtn.focus();
  };

  const close = () => {
    modal.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    btn.focus();
  };

  // Initialize current user (default to window.__USER__)
  const boot = () => {
    const u = loadUser();
    const locked = isAuthLocked();
    // Only seed default user once, and never after explicit logout.
    if (!locked && !isLoggedIn(u) && window.__USER__ && window.__USER__.nickname) {
      const seeded = normalizeUser(window.__USER__);
      saveUser(seeded);
      updateTopbar(seeded);
      return;
    }
    updateTopbar(u);
  };
  boot();

  // Keep top-right user display in sync with auth gate logins/logouts.
  const syncFromStorage = () => {
    const u = loadUser();
    updateTopbar(u);
    if (!modal.hidden) fill();
  };
  window.addEventListener("auth:change", syncFromStorage);
  window.addEventListener("storage", syncFromStorage);

  modal.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.close === "true") close();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  if (birthdayInput) {
    birthdayInput.addEventListener("input", () => {
      const u = loadUser();
      const next = normalizeUser({ ...u, birthday: birthdayInput.value });
      saveUser(next);
      if (ageEl) ageEl.textContent = calcAge(next.birthday);
      updateTopbar(next);
    });
  }

  if (secondaryBtn) {
    secondaryBtn.addEventListener("click", () => {
      if (currentView === "profile") {
        setView("login");
        return;
      }
      const behavior = secondaryBtn.dataset.cancelBehavior || "close";
      if (behavior === "back") setView("profile");
      else close();
    });
  }

  if (primaryBtn) {
    primaryBtn.addEventListener("click", () => {
      if (currentView === "profile") {
        clearUser();
        setAuthLocked(true);
        updateTopbar(normalizeUser({}));
        setView("login");
        window.dispatchEvent(new CustomEvent("auth:change"));
        return;
      }
      if (loginForm && typeof loginForm.requestSubmit === "function") {
        loginForm.requestSubmit();
      } else if (loginForm) {
        loginForm.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });
  }

  if (toggleRegisterBtn) {
    toggleRegisterBtn.addEventListener("click", () => {
      authMode = authMode === "register" ? "login" : "register";
      if (loginError) loginError.textContent = "";
      if (toggleRegisterBtn) {
        toggleRegisterBtn.textContent = authMode === "register" ? "已有账号？去登陆" : "没有账号？注册";
      }
      if (registerBirthdayRow) registerBirthdayRow.hidden = authMode !== "register";
      syncFooter();
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const username = (loginUsername ? loginUsername.value : "").trim();
      const password = loginPassword ? loginPassword.value : "";
      if (!username || !password) {
        if (loginError) loginError.textContent = "请输入用户名和密码";
        return;
      }

      const all = getAllUsers();

      if (authMode === "register") {
        const birthday = (registerBirthday ? registerBirthday.value : "").trim();
        if (!birthday) {
          if (loginError) loginError.textContent = "请填写生日";
          return;
        }
        if (all[username]) {
          if (loginError) loginError.textContent = "用户名已存在";
          return;
        }
        const db = loadUserDb();
        db[username] = { password, birthday };
        saveUserDb(db);
        const next = normalizeUser({ nickname: username, birthday });
        saveUser(next);
        setAuthLocked(false);
        fill();
        setView("profile");
        window.dispatchEvent(new CustomEvent("auth:change"));
        return;
      }

      const record = all[username];
      const ok = Boolean(record && record.password === password);
      if (!ok) {
        if (loginError) loginError.textContent = "密码错误或与用户名不匹配";
        if (loginPassword && typeof loginPassword.focus === "function") loginPassword.focus();
        return;
      }

      const next = normalizeUser({ nickname: username, birthday: record.birthday || "2026-03-30" });
      saveUser(next);
      setAuthLocked(false);
      fill();
      setView("profile");
      window.dispatchEvent(new CustomEvent("auth:change"));
    });
  }

  const openWithView = () => {
    const u = loadUser();
    if (isLoggedIn(u)) setView("profile");
    else setView("login");
    open();
  };

  btn.addEventListener("click", () => {
    const u = loadUser();
    updateTopbar(u);
    if (modal.hidden) openWithView();
    else close();
  });
})();

