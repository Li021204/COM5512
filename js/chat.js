(() => {
  // Persisted chat background (set from Settings -> General)
  try {
    const KEY = "chatBgDataUrl";
    const img = document.querySelector(".heroMedia__img");
    if (img instanceof HTMLImageElement) {
      if (!img.getAttribute("data-default-src")) img.setAttribute("data-default-src", img.src);
      const d = localStorage.getItem(KEY);
      if (d) img.src = String(d);
    }
  } catch {}

  const contactsCard = document.getElementById("contactsCard") || document.querySelector(".leftCol .card:first-child");
  const list = contactsCard ? contactsCard.querySelector(".list") : null;
  const featuresCard = document.getElementById("featuresCard") || document.querySelector(".leftCol .card:last-child");
  const featuresList = featuresCard ? featuresCard.querySelector(".list") : null;
  const bubbles = document.getElementById("chatBubbles");
  const targetTitleEl = document.getElementById("chatTargetTitle");
  const input = document.getElementById("chatInput");
  const micBtn = document.getElementById("chatMicBtn");
  const plusBtn = document.getElementById("chatPlusBtn");
  const clearBtn = document.getElementById("chatClearBtn");
  const sendBtn = document.getElementById("chatSendBtn");
  const heroScroll = document.querySelector(".heroScroll");

  if (!list || !bubbles || !input || !sendBtn) return;

  const USER_KEY = "currentUser";
  const MSG_KEY = "messagesByContact";

  const getUserId = () => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      const u = raw ? JSON.parse(raw) : null;
      const nick = u && u.nickname ? String(u.nickname) : "";
      return nick.trim() || "guest";
    } catch {
      return "guest";
    }
  };

  const contactKey = (name) => `${getUserId()}::${String(name || "").trim()}`;

  const loadAll = () => {
    try {
      const raw = localStorage.getItem(MSG_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const saveAll = (all) => {
    try {
      localStorage.setItem(MSG_KEY, JSON.stringify(all));
    } catch {}
  };

  // One-time cleanup: remove "测试测试" from GROUP1 -> 儿子 history
  const CLEAN_KEY = "cleanup__remove_test_test__v1";
  const cleanupOnce = () => {
    try {
      if (localStorage.getItem(CLEAN_KEY) === "1") return;
      const raw = localStorage.getItem(MSG_KEY);
      const all = raw ? JSON.parse(raw) : {};
      const key = "GROUP1::儿子";
      const arr = Array.isArray(all[key]) ? all[key] : null;
      if (arr && arr.length) {
        const next = arr.filter((m) => String(m && m.text ? m.text : "").trim() !== "测试测试");
        all[key] = next;
        localStorage.setItem(MSG_KEY, JSON.stringify(all));
      }
      localStorage.setItem(CLEAN_KEY, "1");
    } catch {}
  };
  cleanupOnce();

  const loadMessages = (name) => {
    const all = loadAll();
    const key = contactKey(name);
    const arr = all[key];
    return Array.isArray(arr) ? arr : [];
  };

  const appendMessage = (name, msg) => {
    const all = loadAll();
    const key = contactKey(name);
    const arr = Array.isArray(all[key]) ? all[key] : [];
    arr.push(msg);
    all[key] = arr;
    saveAll(all);
  };

  let currentContact = null;
  let chatMode = "normal"; // normal | anti_fraud | health | daily | intergen

  const SETTINGS_LS_KEY = "settings__v1";
  const voiceReadEnabled = () => {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_LS_KEY) || "{}") || {};
      if (s.a11y_care_mode) return true;
      return !!s.a11y_voice_read;
    } catch {
      return false;
    }
  };

  /** 已朗读过的助手消息签名（按联系人），避免删消息后“最后一条”回到旧气泡时重复朗读 */
  const assistantAnnouncedSigsByContact = Object.create(null);
  let zhVoice = null;

  const langStartsZh = (lang) => {
    const l = String(lang || "").toLowerCase();
    return l.startsWith("zh");
  };

  /** 尽量选甜美温柔的中文女声；各系统命名差异大，用关键词打分 */
  const TTS_MALE_HINTS =
    /kangkang|yunxi|yunyang|yunjian|yunfeng|liang\b|male|男|男声|男性|david|dawei|dalong|zhiwei|shengdan|kaifu/i;
  const TTS_FEMALE_HINTS =
    /xiaoxiao|xiaoyi|xiaochen|xiaohan|xiaomeng|xiaomo|xiaorui|xiaoshuang|xiaoxuan|xiaoyan|xiaoyou|huihui|hui hui|ting[- ]?ting|mei[- ]?jia|sin[- ]?ji|yaoyao|lina|linlin|shanshan|female|女|女孩|girl|sweet|neural.*xia|zh-cn-xia/i;

  const scoreVoiceForSweetFemale = (v) => {
    const name = String(v.name || "");
    const lang = String(v.lang || "").toLowerCase();
    const uri = String(v.voiceURI || "");
    if (TTS_MALE_HINTS.test(name) || TTS_MALE_HINTS.test(uri)) return -1;
    const isZh =
      lang.includes("zh") ||
      /[\u4e00-\u9fff]/.test(name) ||
      /chinese|mandarin|cantonese|putong|中文|国语|普通话/i.test(name + uri);
    if (!isZh) return -1;
    let s = 8;
    if (TTS_FEMALE_HINTS.test(name) || TTS_FEMALE_HINTS.test(uri)) s += 120;
    if (/neural/i.test(name)) s += 45;
    if (langStartsZh(lang)) s += 18;
    if (/cn|china|简体|大陆(?!港)/i.test(lang + name)) s += 8;
    return s;
  };

  const pickZhVoice = () => {
    if (zhVoice) return zhVoice;
    const syn = window.speechSynthesis;
    if (!syn) return null;
    const voices = syn.getVoices() || [];
    const ranked = voices
      .map((v) => ({ v, s: scoreVoiceForSweetFemale(v) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s);
    if (ranked.length) {
      zhVoice = ranked[0].v;
      return zhVoice;
    }
    zhVoice =
      voices.find((vv) => langStartsZh(String(vv.lang || ""))) ||
      voices.find((vv) => String(vv.lang || "").toLowerCase().includes("zh")) ||
      null;
    return zhVoice;
  };

  const assistantSpeakText = (m) => {
    if (!m || m.side !== "left") return "";
    if (m.kind === "typing") return "";
    if (m.kind === "file" && m.file) {
      const k = String(m.file.kind || "");
      const nm = String(m.file.name || "附件");
      if (k === "image") return `发来一张图片：${nm}`;
      if (k === "video") return `发来一段视频：${nm}`;
      if (k === "audio") return `发来一段语音：${nm}`;
      return `发来一个文件：${nm}`;
    }
    return String(m.text || "").trim();
  };

  const assistantMsgSig = (m) => {
    const t = assistantSpeakText(m);
    if (!t) return null;
    return JSON.stringify({ ts: m.ts, k: m.kind || "text", t });
  };

  const lastAssistantTtsPayload = (msgs) => {
    if (!Array.isArray(msgs) || !msgs.length) return null;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      const m = msgs[i];
      if (!m || m.side !== "left" || m.kind === "typing") continue;
      const sig = assistantMsgSig(m);
      if (!sig) continue;
      return { sig, text: assistantSpeakText(m) };
    }
    return null;
  };

  const primeVoiceReadBaseline = (name, msgs) => {
    if (!name || !voiceReadEnabled()) return;
    const set = new Set();
    if (Array.isArray(msgs)) {
      for (const m of msgs) {
        const s = assistantMsgSig(m);
        if (s) set.add(s);
      }
    }
    assistantAnnouncedSigsByContact[name] = set;
  };

  const cancelHomeTts = () => {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
  };

  const speakHomeText = (text) => {
    const syn = window.speechSynthesis;
    if (!syn || !text) return;
    try {
      syn.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      const v = pickZhVoice();
      if (v) u.voice = v;
      u.rate = 0.93;
      u.pitch = 1.06;
      syn.speak(u);
    } catch {}
  };

  const onChatMessagesRendered = (msgs) => {
    const c = currentContact;
    if (!c) return;

    if (!voiceReadEnabled()) {
      cancelHomeTts();
      return;
    }

    const last = Array.isArray(msgs) ? msgs[msgs.length - 1] : null;
    if (last && last.kind === "typing") {
      cancelHomeTts();
      return;
    }

    const hit = lastAssistantTtsPayload(msgs);
    if (!hit) return;

    let set = assistantAnnouncedSigsByContact[c];
    if (!(set instanceof Set)) {
      set = new Set();
      assistantAnnouncedSigsByContact[c] = set;
    }
    if (set.has(hit.sig)) return;
    set.add(hit.sig);
    speakHomeText(hit.text);
  };

  try {
    const syn = window.speechSynthesis;
    if (syn) {
      syn.onvoiceschanged = () => {
        zhVoice = null;
        pickZhVoice();
      };
    }
  } catch {}

  const baselineVoiceReadForCurrentChat = () => {
    if (!currentContact || !voiceReadEnabled()) return;
    primeVoiceReadBaseline(currentContact, loadMessages(currentContact));
  };

  window.addEventListener("settings:v1", () => {
    if (!voiceReadEnabled()) {
      cancelHomeTts();
      return;
    }
    baselineVoiceReadForCurrentChat();
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== SETTINGS_LS_KEY) return;
    if (!voiceReadEnabled()) {
      cancelHomeTts();
      return;
    }
    baselineVoiceReadForCurrentChat();
  });

  const escapeHtml = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const renderEmpty = () => {
    cancelHomeTts();
    if (currentContact) delete assistantAnnouncedSigsByContact[currentContact];
    bubbles.innerHTML = `
      <div class="bubble bubble--left">
        <div class="bubble__avatar"></div>
        <div class="bubble__card">
          <div class="bubble__text">暂无消息记录，请开始聊天吧！</div>
        </div>
      </div>
    `;
  };

  let armedMsgIdx = null; // for single-message delete UI

  const bytesToSize = (n) => {
    const v = Number(n || 0);
    if (!v) return "";
    const units = ["B", "KB", "MB", "GB"];
    let x = v;
    let i = 0;
    while (x >= 1024 && i < units.length - 1) {
      x /= 1024;
      i += 1;
    }
    const s = i === 0 ? String(Math.round(x)) : x.toFixed(1);
    return `${s}${units[i]}`;
  };

  const renderAttachmentInner = (f) => {
    const name = escapeHtml(f?.name || "文件");
    const size = escapeHtml(bytesToSize(f?.size || 0));
    const kind = String(f?.kind || "");
    const src = f?.dataUrl ? String(f.dataUrl) : f?.url ? String(f.url) : "";
    if (kind === "image" && src) {
      return `
        <div class="att att--image">
          <img class="att__img" src="${escapeHtml(src)}" alt="${name}" />
          <div class="att__meta">${name}${size ? ` · ${size}` : ""}</div>
        </div>
      `;
    }
    if (kind === "video" && src) {
      return `
        <div class="att att--video">
          <video class="att__video" src="${escapeHtml(src)}" controls></video>
          <div class="att__meta">${name}${size ? ` · ${size}` : ""}</div>
        </div>
      `;
    }
    if (kind === "audio" && src) {
      return `
        <div class="att att--audio">
          <audio class="att__audio" src="${escapeHtml(src)}" controls></audio>
          <div class="att__meta">${name}${size ? ` · ${size}` : ""}</div>
        </div>
      `;
    }
    // generic file
    return `
      <div class="att att--file">
        <div class="att__fileRow">
          <div class="att__fileIcon" aria-hidden="true">📎</div>
          <div class="att__fileText">
            <div class="att__fileName">${name}</div>
            <div class="att__meta">${size || "文件"}</div>
          </div>
        </div>
      </div>
    `;
  };

  const renderMessages = (msgs) => {
    if (!msgs.length) return renderEmpty();
    bubbles.innerHTML = msgs
      .map((m, idx) => {
        const side = m.side === "right" ? "right" : "left";
        const isTyping = m && m.kind === "typing";
        const actions =
          armedMsgIdx === idx && !isTyping
            ? `<div class="bubble__actions">
                 <button class="bubbleDelBtn" type="button" data-action="del" data-idx="${idx}">删除</button>
               </div>`
            : "";
        const isAtt = m && m.kind === "file" && m.file;
        let inner;
        if (isTyping) {
          inner = `<div class="bubble__text bubble__text--thinking" role="status" aria-live="polite">小乔正在思考中<span class="thinkingDots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></div>`;
        } else if (isAtt) {
          inner = renderAttachmentInner(m.file);
        } else {
          inner = `<div class="bubble__text">${escapeHtml(m.text || "")}</div>`;
        }
        return `
          <div class="bubble bubble--${side}" data-idx="${idx}">
            <div class="bubble__avatar"></div>
            <div class="bubble__card">
              ${inner}
            </div>
            ${actions}
          </div>
        `;
      })
      .join("");
    onChatMessagesRendered(msgs);
  };

  const scrollToBottom = () => {
    if (!heroScroll) return;
    heroScroll.scrollTop = heroScroll.scrollHeight;
  };

  const setActiveRow = (row) => {
    list.querySelectorAll(".row").forEach((r) => r.classList.remove("isActive"));
    row.classList.add("isActive");
  };

  const updateLastMessageInRow = (row, text) => {
    const sub = row.querySelector(".row__sub");
    if (sub) sub.textContent = text || "暂无消息记录，请开始聊天吧！";
  };

  const previewFromLastMsg = (m) => {
    if (!m) return "";
    if (m.kind === "typing") return "小乔正在思考中…";
    if (m.kind === "file" && m.file) return `[${m.file.name || "附件"}]`;
    return String(m.text || "");
  };

  const refreshPreviews = () => {
    const all = loadAll();
    Array.from(list.querySelectorAll(".row[data-name]")).forEach((row) => {
      const name = row.getAttribute("data-name") || "";
      const key = contactKey(name);
      const msgs = Array.isArray(all[key]) ? all[key] : [];
      const last = msgs.length ? msgs[msgs.length - 1] : null;
      updateLastMessageInRow(row, previewFromLastMsg(last));
    });
  };

  const openContact = (row) => {
    const name = row.getAttribute("data-name") || row.querySelector(".row__name")?.textContent || "";
    const category = row.getAttribute("data-category") || "";
    currentContact = name.trim();
    chatMode = "normal";
    if (targetTitleEl) {
      const isGroup = category === "groups" || currentContact.includes("群");
      const count = row.getAttribute("data-count");
      const suffix = isGroup ? ` (${count || 7})` : "";
      targetTitleEl.textContent = `${currentContact || "—"}${suffix}`;
    }
    setActiveRow(row);
    const msgs = loadMessages(currentContact);
    primeVoiceReadBaseline(currentContact, msgs);
    armedMsgIdx = null;
    renderMessages(msgs);
    scrollToBottom();
  };

  const openFeatureChat = (featureName) => {
    const name = String(featureName || "").trim();
    if (!name) return;
    currentContact = name;
    chatMode =
      name === "诈骗识别"
        ? "anti_fraud"
        : name === "健康咨询"
          ? "health"
          : name === "与小乔聊天"
            ? "daily"
            : name === "代际沟通"
              ? "intergen"
            : "normal";
    if (targetTitleEl) targetTitleEl.textContent = name;

    if (chatMode === "anti_fraud") {
      const msgs = loadMessages(currentContact);
      if (!msgs.length) {
        appendMessage(currentContact, {
          side: "left",
          text: "把可疑短信/来电内容粘贴给我，我帮您判断是否诈骗，并给出可操作建议。",
          ts: Date.now(),
        });
      }
    }
    if (name === "代际沟通") {
      const msgs = loadMessages(currentContact);
      if (!msgs.length) {
        appendMessage(currentContact, {
          side: "left",
          text: "欢迎使用「代际沟通」。你可以输入：你想和谁沟通（如儿子/女儿/孙子）、发生了什么、你希望达到的结果。我会帮你把话说得更清楚、更温和，也可以给出可直接发送的消息模板。",
          ts: Date.now(),
        });
      }
    }
    if (name === "健康咨询") {
      const msgs = loadMessages(currentContact);
      if (!msgs.length) {
        appendMessage(currentContact, {
          side: "left",
          text: "欢迎来「健康咨询」。您可以说：哪里不舒服、持续多久、有没有发烧/头晕。\n如果胸口痛、喘不上气，请立刻打120。",
          ts: Date.now(),
        });
      }
    }
    if (name === "与小乔聊天") {
      const msgs = loadMessages(currentContact);
      if (!msgs.length) {
        appendMessage(currentContact, {
          side: "left",
          text: "我在呢。\n您今天过得怎么样？\n想聊什么都可以。",
          ts: Date.now(),
        });
      }
    }

    const msgs = loadMessages(currentContact);
    primeVoiceReadBaseline(currentContact, msgs);
    armedMsgIdx = null;
    renderMessages(msgs);
    scrollToBottom();
    refreshPreviews();
  };

  // Click to switch contacts (event delegation; supports dynamically added rows)
  list.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const row = t.closest(".row");
    if (!row || !list.contains(row)) return;
    openContact(row);
  });

  // Click features to open corresponding chat
  if (featuresList) {
    featuresList.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const row = t.closest(".row");
      if (!row || !featuresList.contains(row)) return;
      const name = row.getAttribute("data-feature") || row.querySelector(".row__name")?.textContent || "";
      openFeatureChat(name);
    });
  }

  /** 仅当「上一条」是用户发的图片时，与本条文字一起送给 anti_scam_pipeline（避免误带旧图） */
  const getPairedRightImageFile = () => {
    const msgs = loadMessages(currentContact);
    if (!msgs.length) return null;
    const prev = msgs[msgs.length - 1];
    if (prev && prev.side === "right" && prev.kind === "file" && prev.file) {
      const fk = String(prev.file.kind || "");
      if (fk === "image") return prev.file;
    }
    return null;
  };

  const getPairedRightAudioOrVideoFile = () => {
    const msgs = loadMessages(currentContact);
    if (!msgs.length) return null;
    const prev = msgs[msgs.length - 1];
    if (prev && prev.side === "right" && prev.kind === "file" && prev.file) {
      const fk = String(prev.file.kind || "");
      if (fk === "audio" || fk === "video") return prev.file;
    }
    return null;
  };

  const resolveBlobFromAttachment = async (file) => {
    if (!file) return null;
    const d = file.dataUrl ? String(file.dataUrl) : "";
    if (d.startsWith("data:")) {
      try {
        const res = await fetch(d);
        return await res.blob();
      } catch {
        return null;
      }
    }
    const u = file.url ? String(file.url) : "";
    if (u.startsWith("blob:")) {
      try {
        const res = await fetch(u);
        return await res.blob();
      } catch {
        return null;
      }
    }
    return null;
  };

  const blobUrlToDataUrl = async (blobUrl, mime) => {
    try {
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      const b64 = btoa(binary);
      const mt = mime && String(mime).trim() ? String(mime) : "image/jpeg";
      return `data:${mt};base64,${b64}`;
    } catch {
      return null;
    }
  };

  const resolveAntiFraudImageBase64 = async (file) => {
    if (!file) return null;
    const d = file.dataUrl ? String(file.dataUrl) : "";
    if (d.startsWith("data:image")) return d;
    const u = file.url ? String(file.url) : "";
    if (u.startsWith("blob:")) {
      return blobUrlToDataUrl(u, file.type || "image/jpeg");
    }
    return null;
  };

  /** 去掉旧的「思考中」占位，再追加一条新的（诈骗识别等待接口时） */
  const appendThinkingPlaceholder = (name) => {
    const all = loadAll();
    const key = contactKey(name);
    const prev = Array.isArray(all[key]) ? all[key] : [];
    const next = prev.filter((m) => m && m.kind !== "typing");
    next.push({ side: "left", kind: "typing", ts: Date.now() });
    all[key] = next;
    saveAll(all);
  };

  /** 将最后一条 typing 占位替换为正式回复（无占位则追加） */
  const replaceThinkingWithReply = (name, replyText) => {
    const all = loadAll();
    const key = contactKey(name);
    const arr = Array.isArray(all[key]) ? [...all[key]] : [];
    let replaced = false;
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] && arr[i].kind === "typing") {
        arr[i] = { side: "left", text: replyText, ts: Date.now() };
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      arr.push({ side: "left", text: replyText, ts: Date.now() });
    }
    all[key] = arr;
    saveAll(all);
  };

  const sendCurrent = async () => {
    if (!currentContact) return;
    const isAnti = chatMode === "anti_fraud";
    const isHealth = chatMode === "health";
    const isDaily = chatMode === "daily";
    const isIntergen = chatMode === "intergen";
    let text = input.value.trim();
    const pairImage = isAnti ? getPairedRightImageFile() : null;
    const pairAV = isAnti ? getPairedRightAudioOrVideoFile() : null;

    if (!text) {
      if (isAnti && pairAV) {
        text = "请识别这段录音/视频内容，并判断是否存在诈骗风险。";
      } else if (isAnti && pairImage) {
        text = "请结合截图中的文字分析是否存在诈骗风险。";
      } else {
        return;
      }
    }

    const msg = { side: "right", text, ts: Date.now() };
    appendMessage(currentContact, msg);
    input.value = "";
    const afterSend = () => {
      const msgs = loadMessages(currentContact);
      armedMsgIdx = null;
      renderMessages(msgs);
      scrollToBottom();
      refreshPreviews();
    };
    afterSend();

    if (isAnti) {
      appendThinkingPlaceholder(currentContact);
      armedMsgIdx = null;
      renderMessages(loadMessages(currentContact));
      scrollToBottom();
      refreshPreviews();

      try {
        // Route: if user uploaded audio/video, use the LLM phone-scam pipeline endpoint.
        if (pairAV) {
          const blob = await resolveBlobFromAttachment(pairAV);
          if (!blob) throw new Error("无法读取附件内容");
          const fd = new FormData();
          const name = pairAV.name || (pairAV.kind === "video" ? "clip.mp4" : "audio.wav");
          fd.append("audio", blob, name);
          fd.append("text", text);

          const res = await fetch("/api/anti_fraud/audio", { method: "POST", body: fd });
          const data = await res.json().catch(() => null);
          if (!data || !data.ok) {
            replaceThinkingWithReply(currentContact, String(data?.error || "") || "反诈音频识别暂时失败了，您稍后再试一次。");
            afterSend();
            return;
          }
          const reply = String(data.reply_text || "").trim() || "我暂时没识别出重点，您再补充一句对方让您做什么？";
          replaceThinkingWithReply(currentContact, reply);
          afterSend();
          return;
        }

        // Default: original route (text + optional image)
        const imageBase64 = await resolveAntiFraudImageBase64(pairImage);
        const body = { text };
        if (imageBase64) body.image_base64 = imageBase64;

        fetch("/api/anti_fraud/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then((r) => r.json().catch(() => null))
          .then((data) => {
            if (!data || !data.ok) {
              replaceThinkingWithReply(currentContact, "反诈分析暂时失败了，您稍后再试一次。");
              afterSend();
              return;
            }
            const reply =
              String(data.reply_text || "").trim() || "我暂时没识别出重点，您再补充一句对方让您做什么？";
            replaceThinkingWithReply(currentContact, reply);
            afterSend();
          })
          .catch(() => {
            replaceThinkingWithReply(currentContact, "反诈分析暂时失败了，您稍后再试一次。");
            afterSend();
          });
      } catch (e) {
        replaceThinkingWithReply(currentContact, "反诈音频识别暂时失败了，您稍后再试一次。");
        afterSend();
      }
    }

    if (isHealth) {
      // lightweight "thinking" placeholder reuse
      appendThinkingPlaceholder(currentContact);
      armedMsgIdx = null;
      renderMessages(loadMessages(currentContact));
      scrollToBottom();
      refreshPreviews();

      fetch("/api/health/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, user_id: getUserId() }),
      })
        .then((r) => r.json().catch(() => null))
        .then((data) => {
          if (!data || !data.ok) {
            replaceThinkingWithReply(currentContact, "健康咨询暂时失败了，您稍后再试一次。");
            afterSend();
            return;
          }
          const reply = String(data.reply_text || "").trim() || "我先帮您理清楚：您哪里不舒服、多久了？";
          replaceThinkingWithReply(currentContact, reply);
          afterSend();
        })
        .catch(() => {
          replaceThinkingWithReply(currentContact, "健康咨询暂时失败了，您稍后再试一次。");
          afterSend();
        });
    }

    if (isDaily) {
      appendThinkingPlaceholder(currentContact);
      armedMsgIdx = null;
      renderMessages(loadMessages(currentContact));
      scrollToBottom();
      refreshPreviews();

      fetch("/api/daily/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, user_id: getUserId() }),
      })
        .then((r) => r.json().catch(() => null))
        .then((data) => {
          if (!data || !data.ok) {
            replaceThinkingWithReply(currentContact, "我刚才走神了，您再说一遍好吗？");
            afterSend();
            return;
          }
          const reply = String(data.reply_text || "").trim() || "我在呢，您慢慢说。";
          replaceThinkingWithReply(currentContact, reply);
          afterSend();
        })
        .catch(() => {
          replaceThinkingWithReply(currentContact, "我刚才走神了，您再说一遍好吗？");
          afterSend();
        });
    }

    if (isIntergen) {
      appendThinkingPlaceholder(currentContact);
      armedMsgIdx = null;
      renderMessages(loadMessages(currentContact));
      scrollToBottom();
      refreshPreviews();

      fetch("/api/intergenerational/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, user_id: getUserId(), direction: "elder_to_child" }),
      })
        .then((r) => r.json().catch(() => null))
        .then((data) => {
          if (!data || !data.ok) {
            replaceThinkingWithReply(currentContact, "代际沟通暂时失败了，您稍后再试一次。");
            afterSend();
            return;
          }
          const reply = String(data.reply_text || "").trim() || "我在呢。您愿意的话，先说说发生了什么？";
          replaceThinkingWithReply(currentContact, reply);
          afterSend();
        })
        .catch(() => {
          replaceThinkingWithReply(currentContact, "代际沟通暂时失败了，您稍后再试一次。");
          afterSend();
        });
    }
  };

  sendBtn.addEventListener("click", sendCurrent);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendCurrent();
    }
  });

  // Voice input (Web Speech API)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let recognizing = false;
  let voiceMode = null; // "sr" | "wav" | null
  let srRetryCount = 0;
  const SR_MAX_RETRY = 1;
  let srUserStop = false;
  let sttPref = null; // "sr" | "whisper_local" | "whisper_server" | null

  const ensureMicPermission = async () => {
    // getUserMedia requires a secure context (https / localhost). file:// is commonly blocked.
    if (!window.isSecureContext) {
      setMicState("error");
      setHint("当前页面不是安全上下文，无法使用麦克风。请用 Flask 打开： http://127.0.0.1:5050/");
      setTimeout(() => setHint(""), 4500);
      return false;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicState("error");
      setHint("当前设备不支持麦克风权限请求（getUserMedia 不可用）。");
      setTimeout(() => setHint(""), 2500);
      return false;
    }

    // If Permissions API is available, check "denied" early.
    try {
      if (navigator.permissions && navigator.permissions.query) {
        // Some browsers may throw if "microphone" name not supported.
        const st = await navigator.permissions.query({ name: "microphone" });
        if (st && st.state === "denied") {
          setMicState("error");
          setHint("麦克风权限已被拒绝，请在浏览器设置中允许麦克风后再试。");
          setTimeout(() => setHint(""), 3000);
          return false;
        }
      }
    } catch {
      // ignore: we'll try getUserMedia to trigger prompt.
    }

    // Trigger the permission prompt (must be called from a user gesture).
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (e) {
      const name = e && typeof e === "object" && "name" in e ? String(e.name || "") : "";
      let msg = "无法获取麦克风权限，请在浏览器设置中允许麦克风。";
      if (name === "NotAllowedError" || name === "SecurityError") {
        msg = "麦克风权限被拒绝/被系统限制。请在浏览器与系统设置中允许麦克风。";
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        msg = "未检测到麦克风设备，请检查是否连接耳机/麦克风。";
      } else if (name === "NotReadableError" || name === "AbortError") {
        msg = "麦克风被占用或不可读，请关闭其他占用麦克风的应用后重试。";
      }
      setMicState("error");
      setHint(msg);
      setTimeout(() => setHint(""), 3000);
      return false;
    }
  };

  const ensureHintEl = () => {
    const composer = document.querySelector(".composer");
    if (!composer) return null;
    let el = composer.querySelector(".composer__hint");
    if (!el) {
      el = document.createElement("div");
      el.className = "composer__hint";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      composer.insertBefore(el, composer.firstChild);
    }
    return el;
  };

  const setHint = (s) => {
    const el = ensureHintEl();
    if (!el) return;
    el.textContent = s || "";
    el.hidden = !s;
  };

  const setMicState = (state) => {
    if (!micBtn) return;
    micBtn.classList.toggle("isRecording", state === "listening" || state === "recording");
    micBtn.classList.toggle("isTranscribing", state === "transcribing");
    micBtn.classList.toggle("isError", state === "error");
  };

  const stopSr = () => {
    if (recognition && recognizing) {
      try {
        recognition.stop();
      } catch {}
    }
  };

  // Fallback: record WAV (16kHz mono) and send to server for STT
  let wavRec = null;
  let wavRecording = false;
  let wavUseLocal = false;

  const downsampleTo16k = (buffer, inputRate) => {
    if (inputRate === 16000) return buffer;
    const ratio = inputRate / 16000;
    const newLen = Math.round(buffer.length / ratio);
    const out = new Float32Array(newLen);
    let offset = 0;
    for (let i = 0; i < newLen; i += 1) {
      const next = Math.round((i + 1) * ratio);
      let sum = 0;
      let count = 0;
      for (let j = offset; j < next && j < buffer.length; j += 1) {
        sum += buffer[j];
        count += 1;
      }
      out[i] = count ? sum / count : 0;
      offset = next;
    }
    return out;
  };

  const encodeWav16 = (samples16k) => {
    const numSamples = samples16k.length;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true); // PCM
    view.setUint16(20, 1, true); // linear PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, 16000, true); // sample rate
    view.setUint32(28, 16000 * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits
    writeStr(36, "data");
    view.setUint32(40, numSamples * 2, true);
    let offset = 44;
    for (let i = 0; i < numSamples; i += 1) {
      const s = Math.max(-1, Math.min(1, samples16k[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
    return new Blob([buffer], { type: "audio/wav" });
  };

  const pickBestSttPath = async () => {
    // 1) If browser SR exists, it's usually best latency/UX.
    if (SpeechRecognition) return "sr";
    // 2) Try browser-local Whisper (may require model download).
    if (window.__whisperLocalIsSupported && window.__whisperLocalIsSupported()) {
      try {
        setHint("正在准备本地语音识别…（首次可能需要下载模型）");
        const ok = await window.__whisperLocalEnsureLoaded?.();
        if (ok) return "whisper_local";
      } catch {}
    }
    // 3) Server whisper (Flask /api/stt)
    return "whisper_server";
  };

  const startWavRec = async () => {
    if (!micBtn) return;
    if (location.protocol === "file:") {
      alert("语音识别回退模式需要后端接口，请用 Flask 运行（http://127.0.0.1:5050/）再试。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        alert("当前浏览器不支持 AudioContext，无法录音。");
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const ctx = new AC();
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const chunks = [];
      setHint("录音中…（再点一次结束）");
      proc.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(data));
      };
      source.connect(proc);
      proc.connect(ctx.destination);

      wavRec = { stream, ctx, source, proc, chunks };
      wavRecording = true;
      voiceMode = "wav";
      setMicState("recording");
    } catch {
      alert("无法获取麦克风权限，请在浏览器设置中允许麦克风。");
    }
  };

  const stopWavRec = async () => {
    if (!wavRec || !wavRecording) return;
    wavRecording = false;
    setMicState("transcribing");
    setHint("正在识别…");

    const { stream, ctx, source, proc, chunks } = wavRec;
    wavRec = null;

    try { proc.disconnect(); } catch {}
    try { source.disconnect(); } catch {}
    try { stream.getTracks().forEach((t) => t.stop()); } catch {}

    const inputRate = ctx.sampleRate || 44100;
    try { await ctx.close(); } catch {}

    const total = chunks.reduce((n, a) => n + a.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const a of chunks) {
      merged.set(a, off);
      off += a.length;
    }
    const samples16k = downsampleTo16k(merged, inputRate);
    const wavBlob = encodeWav16(samples16k);

    if (wavUseLocal && window.__whisperLocalTranscribe) {
      try {
        const r = await window.__whisperLocalTranscribe(wavBlob);
        if (!r || !r.ok) {
          const msg = r && r.error ? r.error : "本地识别失败";
          // fallback to server whisper
          setHint(`本地识别失败，正在切换服务器识别…`);
          wavUseLocal = false;
        } else {
          const text = String(r.text || "").trim();
          if (text) {
            input.value = text;
            input.focus();
          }
          setMicState("idle");
          setHint("");
          return;
        }
      } catch {
        setHint("本地识别异常，正在切换服务器识别…");
        wavUseLocal = false;
      }
    }

    const fd = new FormData();
    fd.append("audio", wavBlob, "speech.wav");
    try {
      const res = await fetch("/api/stt", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) {
        const msg = data && data.error ? data.error : "语音识别失败";
        setMicState("error");
        setHint(`识别失败：${msg}`);
        setTimeout(() => setHint(""), 2500);
        return;
      }
      const text = String(data.text || "").trim();
      if (text) {
        input.value = text;
        input.focus();
      }
      setMicState("idle");
      setHint("");
    } catch {
      setMicState("error");
      setHint("无法连接语音识别服务，请确认 Flask 正在运行。");
      setTimeout(() => setHint(""), 2500);
    }
  };

  const startRec = () => {
    if (!micBtn) return;
    // Decide best path per device/browser.
    pickBestSttPath().then((path) => {
      sttPref = path;
      if (path !== "sr") {
        wavUseLocal = path === "whisper_local";
        return startWavRec();
      }

      // IMPORTANT: keep within user-gesture chain; avoid await here.
      ensureMicPermission().then((ok) => {
        if (!ok) return;

      recognition = new SpeechRecognition();
      recognition.lang = "zh-CN";
      recognition.interimResults = true;
      recognition.continuous = true;

      let finalText = "";
      const base = input.value; // keep what user already typed
      const mergeIntoInput = (txt) => {
        const merged = (base ? `${base} ` : "") + (txt || "");
        input.value = merged.trimStart();
      };

      recognition.onstart = () => {
        recognizing = true;
        srUserStop = false;
        voiceMode = "sr";
        setMicState("listening");
        setHint("正在聆听…（再点一次结束）");
      };
      recognition.onerror = () => {
        recognizing = false;
        if (srUserStop) return;
        setMicState("error");
      };
      recognition.onend = () => {
        recognizing = false;

        // User explicitly stopped: do not retry/fallback.
        if (srUserStop) {
          setMicState("idle");
          setHint("");
          voiceMode = null;
          srRetryCount = 0;
          srUserStop = false;
          return;
        }

        if (voiceMode === "sr") {
          // If ended without final text, retry once then fallback
          if (!finalText.trim() && srRetryCount < SR_MAX_RETRY) {
            srRetryCount += 1;
            setHint("识别中断，正在重试…");
            setTimeout(() => startRec(), 300);
            return;
          }
          if (!finalText.trim()) {
            // Prefer local whisper if available, else server
            setHint("原生识别不稳定，正在切换 Whisper 识别…");
            setMicState("idle");
            voiceMode = null;
            srRetryCount = 0;
            pickBestSttPath().then((p2) => {
              sttPref = p2;
              wavUseLocal = p2 === "whisper_local";
              startWavRec();
            });
            return;
          }
        }
        setMicState("idle");
        setHint("");
        voiceMode = null;
        srRetryCount = 0;
      };
      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const r = event.results[i];
          const t = r[0] ? r[0].transcript : "";
          if (r.isFinal) finalText += t;
          else interim += t;
        }
        const next = (finalText + interim).trim();
        // Always reflect interim text while speaking.
        mergeIntoInput(next);
        input.focus();
      };

      try {
        recognition.start();
      } catch {
        // If SR start fails, fallback to Whisper.
        setHint("原生识别启动失败，正在切换 Whisper 识别…");
        setMicState("idle");
        voiceMode = null;
        srRetryCount = 0;
        pickBestSttPath().then((p2) => {
          sttPref = p2;
          wavUseLocal = p2 === "whisper_local";
          startWavRec();
        });
      }
      });
    });
  };

  if (micBtn) {
    micBtn.addEventListener("click", () => {
      // Toggle stop if currently listening/recording
      if (recognizing) {
        setHint("正在结束…");
        setMicState("transcribing");
        srUserStop = true;
        return stopSr();
      }
      if (wavRecording) return stopWavRec();
      setMicState("idle");
      return startRec();
    });
  }

  // Upload button: open file picker and insert as attachment messages
  const setupUploader = () => {
    if (!plusBtn) return;
    const composer = document.querySelector(".composer");
    if (!composer) return;
    const picker = document.createElement("input");
    picker.type = "file";
    picker.multiple = true;
    picker.hidden = true;
    picker.accept =
      "image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.rar,.7z";
    composer.appendChild(picker);

    const fileToMsg = async (file) => {
      const type = String(file.type || "");
      const isImage = type.startsWith("image/");
      const isVideo = type.startsWith("video/");
      const isAudio = type.startsWith("audio/");
      const kind = isImage ? "image" : isVideo ? "video" : isAudio ? "audio" : "file";

      // Images: store small ones as dataURL so refresh still shows
      if (isImage && file.size <= 1_500_000) {
        const dataUrl = await new Promise((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ""));
          fr.onerror = () => resolve("");
          fr.readAsDataURL(file);
        });
        return {
          side: "right",
          kind: "file",
          file: { kind, name: file.name, size: file.size, type: file.type, dataUrl },
          ts: Date.now(),
        };
      }

      // Others: use objectURL for immediate preview (won't persist across reload)
      const url = URL.createObjectURL(file);
      return {
        side: "right",
        kind: "file",
        file: { kind, name: file.name, size: file.size, type: file.type, url },
        ts: Date.now(),
      };
    };

    plusBtn.addEventListener("click", () => {
      picker.value = "";
      picker.click(); // triggers system file picker
    });

    picker.addEventListener("change", async () => {
      if (!currentContact) return;
      const files = Array.from(picker.files || []);
      if (!files.length) return;
      for (const f of files) {
        // eslint-disable-next-line no-await-in-loop
        const msg = await fileToMsg(f);
        appendMessage(currentContact, msg);
      }
      const msgs = loadMessages(currentContact);
      armedMsgIdx = null;
      renderMessages(msgs);
      scrollToBottom();
      refreshPreviews();
    });
  };
  setupUploader();

  // Single message delete: tap a bubble to reveal "删除"
  const deleteAt = (idx) => {
    if (!currentContact) return;
    const msgs = loadMessages(currentContact);
    if (!Number.isInteger(idx) || idx < 0 || idx >= msgs.length) return;
    if (!confirm("确定删除这条聊天记录吗？")) return;
    msgs.splice(idx, 1);
    const all = loadAll();
    all[contactKey(currentContact)] = msgs;
    saveAll(all);
    // keep scroll position as much as possible
    const st = heroScroll ? heroScroll.scrollTop : 0;
    armedMsgIdx = null;
    renderMessages(msgs);
    if (heroScroll) requestAnimationFrame(() => (heroScroll.scrollTop = st));
    refreshPreviews();
  };

  bubbles.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const action = t.getAttribute("data-action");
    if (action === "del") {
      const idx = Number(t.getAttribute("data-idx"));
      deleteAt(idx);
      return;
    }
    const bubble = t.closest(".bubble");
    if (!bubble || !bubbles.contains(bubble)) return;
    const idxAttr = bubble.getAttribute("data-idx");
    const idx = idxAttr ? Number(idxAttr) : NaN;
    if (!Number.isFinite(idx)) return;
    const msgs = loadMessages(currentContact);
    if (msgs[idx] && msgs[idx].kind === "typing") return;
    armedMsgIdx = armedMsgIdx === idx ? null : idx;
    const st = heroScroll ? heroScroll.scrollTop : 0;
    renderMessages(msgs);
    if (heroScroll) requestAnimationFrame(() => (heroScroll.scrollTop = st));
  });

  // Click empty area to dismiss delete button
  if (heroScroll) {
    heroScroll.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest(".bubble")) return;
      if (armedMsgIdx !== null) {
        armedMsgIdx = null;
        const msgs = loadMessages(currentContact);
        const st = heroScroll.scrollTop;
        renderMessages(msgs);
        requestAnimationFrame(() => (heroScroll.scrollTop = st));
      }
    });
  }

  const clearCurrent = () => {
    if (!currentContact) return;
    if (!confirm(`确定删除与「${currentContact}」的聊天记录吗？此操作不可撤销。`)) return;
    const all = loadAll();
    const key = contactKey(currentContact);
    all[key] = [];
    saveAll(all);
    armedMsgIdx = null;
    renderEmpty();
    // update preview in left list
    const activeRow = list.querySelector(".row.isActive");
    if (activeRow) updateLastMessageInRow(activeRow, "");
  };
  if (clearBtn) clearBtn.addEventListener("click", clearCurrent);

  // Initial: open the first active row, else the first visible row.
  const init = () => {
    refreshPreviews();
    const active = list.querySelector(".row.isActive");
    if (active) return openContact(active);
    const first = Array.from(list.querySelectorAll(".row")).find((r) => r.style.display !== "none");
    if (first) openContact(first);
    else renderEmpty();
  };

  window.addEventListener("contacts:updated", init);
  init();
})();

