(() => {
  const pad2 = (n) => String(n).padStart(2, "0");

  const numberToCn = (n) => {
    const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    const num = Number(n);
    if (!Number.isFinite(num) || num < 0) return String(n);
    if (num < 10) return digits[num];
    if (num < 20) return `十${num === 10 ? "" : digits[num - 10]}`;
    if (num < 100) {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      return `${digits[tens]}十${ones === 0 ? "" : digits[ones]}`;
    }
    return String(n);
  };

  const replaceArabicNumbersWithCn = (s) =>
    String(s).replace(/\d+/g, (m) => numberToCn(m));

  const weekdayCn = (date) => {
    const map = ["日", "一", "二", "三", "四", "五", "六"];
    return `星期${map[date.getDay()]}`;
  };

  const lunarCn = (date) => {
    // Use built-in ICU Chinese calendar when available.
    // Example output (varies by engine): "2026乙巳年二月十二"
    const fmt = new Intl.DateTimeFormat("zh-Hans-u-ca-chinese", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const raw = fmt.format(date);

    // Strip the "xxxx年" part and keep month+day.
    // Handles: "2026乙巳年二月十二" / "二月十二" / "乙巳年二月十二"
    const idx = raw.lastIndexOf("年");
    const md = idx >= 0 ? raw.slice(idx + 1) : raw;
    return `农历${replaceArabicNumbersWithCn(md)}`;
  };

  const solarCn = (date) => {
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    return `${y}年${m}月${d}日`;
  };

  const dayPeriodCn = (date) => {
    const h = date.getHours();
    if (h >= 0 && h <= 5) return "凌晨";
    if (h >= 6 && h <= 11) return "早上";
    if (h === 12) return "中午";
    if (h >= 13 && h <= 17) return "下午";
    return "晚上";
  };

  const time12hCn = (date) => {
    const h24 = date.getHours();
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const mm = pad2(date.getMinutes());
    return `${dayPeriodCn(date)}${h12}:${mm}`;
  };

  const render = () => {
    const solarEl = document.getElementById("currentDateSolar");
    const lunarEl = document.getElementById("currentDateLunar");
    const legacyDateEl = document.getElementById("currentDateCn");
    const timeEl = document.getElementById("currentTimeCn");
    if (!solarEl && !lunarEl && !legacyDateEl && !timeEl) return;
    const now = new Date();
    if (solarEl && lunarEl) {
      solarEl.textContent = `${solarCn(now)} ${weekdayCn(now)}`;
      lunarEl.textContent = lunarCn(now);
    } else if (legacyDateEl) {
      legacyDateEl.textContent = `${solarCn(now)} ${weekdayCn(now)} ${lunarCn(now)}`;
    }
    if (timeEl) timeEl.textContent = time12hCn(now);
    if (!render.__refitOnce) {
      render.__refitOnce = true;
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("layout-refit")));
    }
  };

  window.addEventListener("load", render, { passive: true });
  // Refresh shortly after load in case fonts/layout settle.
  setTimeout(render, 60);

  // Keep time fresh (minute-level is enough for display)
  const startTicker = () => {
    const now = new Date();
    const msToNextMinute =
      (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 10;
    setTimeout(() => {
      render();
      setInterval(render, 60 * 1000);
    }, Math.max(200, msToNextMinute));
  };
  startTicker();
})();
