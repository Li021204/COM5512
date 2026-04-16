(() => {
  // Browser-local Whisper via Transformers.js (WASM/WebGPU).
  // Exposes:
  // - window.__whisperLocalIsSupported(): boolean
  // - window.__whisperLocalEnsureLoaded(): Promise<boolean>
  // - window.__whisperLocalTranscribe(blobOrUrl): Promise<{ ok: boolean, text?: string, error?: string }>

  const state = {
    loading: null,
    transcriber: null,
    lastError: "",
  };

  const isSupported = () => {
    // Needs module dynamic import + WebAssembly. Most modern browsers OK.
    try {
      return typeof WebAssembly !== "undefined" && typeof Promise !== "undefined";
    } catch {
      return false;
    }
  };

  const ensureLoaded = async () => {
    if (!isSupported()) return false;
    if (state.transcriber) return true;
    if (state.loading) return state.loading;

    // Lazy-load from CDN (no bundler).
    state.loading = (async () => {
      try {
        const mod = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
        const { pipeline, env } = mod;
        // Reduce surprises: prefer browser cache, avoid remote logging.
        if (env) {
          env.allowLocalModels = false;
          env.useBrowserCache = true;
        }
        // Chinese ASR model (tiny: faster, less accurate; can be upgraded later).
        state.transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");
        return true;
      } catch (e) {
        state.lastError = e && typeof e === "object" && "message" in e ? String(e.message || "") : "load failed";
        state.transcriber = null;
        return false;
      } finally {
        state.loading = null;
      }
    })();

    return state.loading;
  };

  const transcribe = async (blobOrUrl) => {
    const ok = await ensureLoaded();
    if (!ok || !state.transcriber) {
      return { ok: false, error: state.lastError || "本地 Whisper 初始化失败" };
    }
    try {
      const input =
        typeof blobOrUrl === "string"
          ? blobOrUrl
          : blobOrUrl instanceof Blob
            ? URL.createObjectURL(blobOrUrl)
            : null;
      if (!input) return { ok: false, error: "无效音频输入" };

      const out = await state.transcriber(input);
      const text = out && typeof out === "object" && "text" in out ? String(out.text || "") : "";
      return { ok: true, text: text.trim() };
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String(e.message || "") : "transcribe failed";
      return { ok: false, error: msg };
    }
  };

  window.__whisperLocalIsSupported = isSupported;
  window.__whisperLocalEnsureLoaded = ensureLoaded;
  window.__whisperLocalTranscribe = transcribe;
})();

