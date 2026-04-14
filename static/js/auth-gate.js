(() => {
  const gate = document.getElementById("authGate");
  const primaryBtn = document.getElementById("authPrimaryBtn");
  const secondaryBtn = document.getElementById("authSecondaryBtn");
  const form = document.getElementById("authGateForm");
  const usernameEl = document.getElementById("gateUsername");
  const passwordEl = document.getElementById("gatePassword");
  const birthdayRow = document.getElementById("gateBirthdayRow");
  const birthdayEl = document.getElementById("gateBirthday");
  const errorEl = document.getElementById("gateError");
  if (!gate || !primaryBtn || !secondaryBtn || !form || !usernameEl || !passwordEl || !birthdayRow || !birthdayEl || !errorEl) return;

  const STORAGE_KEY = "currentUser";
  const USERDB_KEY = "userDb";
  const AUTH_LOCK_KEY = "authLocked";

  const USERS = {
    GROUP1: { password: "12345678", birthday: "2026-03-30" },
  };

  let mode = "landing"; // landing | login | register

  const isLoggedIn = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const u = JSON.parse(raw);
      return Boolean(u && String(u.nickname || "").trim());
    } catch {
      return false;
    }
  };

  const setAuthLocked = (locked) => {
    try {
      if (locked) localStorage.setItem(AUTH_LOCK_KEY, "1");
      else localStorage.removeItem(AUTH_LOCK_KEY);
    } catch {}
  };

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

  const setGated = (gated) => {
    gate.hidden = !gated;
    document.body.classList.toggle("isAuthGated", gated);
  };

  const setMode = (next) => {
    mode = next;
    errorEl.textContent = "";
    if (mode === "landing") {
      form.hidden = true;
      primaryBtn.textContent = "登录";
      secondaryBtn.textContent = "注册";
      birthdayRow.hidden = true;
      usernameEl.value = "";
      passwordEl.value = "";
      birthdayEl.value = "";
      return;
    }

    form.hidden = false;
    birthdayRow.hidden = mode !== "register";
    primaryBtn.textContent = mode === "register" ? "注册" : "登录";
    secondaryBtn.textContent = mode === "register" ? "去登录" : "去注册";
    if (mode === "register" && !birthdayEl.value) birthdayEl.value = "2026-03-30";
    setTimeout(() => usernameEl.focus(), 0);
  };

  const refresh = () => {
    const gated = !isLoggedIn();
    setGated(gated);
    // Always collapse inputs when user isn't interacting.
    if (gated && mode === "landing") setMode("landing");
  };

  primaryBtn.addEventListener("click", () => {
    if (mode === "landing") {
      setMode("login");
      return;
    }

    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    if (!username || !password) {
      errorEl.textContent = "请输入用户名和密码";
      return;
    }

    const all = getAllUsers();

    if (mode === "register") {
      const birthday = birthdayEl.value.trim();
      if (!birthday) {
        errorEl.textContent = "请填写生日";
        return;
      }
      if (all[username]) {
        errorEl.textContent = "用户名已存在";
        return;
      }
      const db = loadUserDb();
      db[username] = { password, birthday };
      saveUserDb(db);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nickname: username, birthday }));
      setAuthLocked(false);
      window.dispatchEvent(new CustomEvent("auth:change"));
      refresh();
      return;
    }

    const record = all[username];
    const ok = Boolean(record && record.password === password);
    if (!ok) {
      errorEl.textContent = "密码错误或与用户名不匹配";
      passwordEl.focus();
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nickname: username, birthday: record.birthday || "2026-03-30" }));
    setAuthLocked(false);
    window.dispatchEvent(new CustomEvent("auth:change"));
    refresh();
  });

  secondaryBtn.addEventListener("click", () => {
    if (mode === "landing") {
      setMode("register");
      return;
    }
    setMode(mode === "register" ? "login" : "register");
  });

  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      primaryBtn.click();
    }
  });

  window.addEventListener("auth:change", refresh);
  window.addEventListener("storage", refresh);
  window.addEventListener("load", refresh, { passive: true });
  setMode("landing");
  refresh();
})();

