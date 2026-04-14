(() => {
  const viewport = document.getElementById("fitViewport");
  const canvas = document.getElementById("fitCanvas");
  if (!viewport || !canvas) return;

  let baseSize = null; // lock intrinsic canvas size after first measure

  const measure = () => {
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(canvas.scrollWidth, canvas.offsetWidth, rect.width);
    const ch = Math.max(canvas.scrollHeight, canvas.offsetHeight, rect.height);
    return { cw, ch };
  };

  const fit = () => {
    // Reset transform to get intrinsic size
    canvas.style.transform = "none";
    // Keep height stable; avoid reflow changes from dynamic content.
    if (!baseSize) canvas.style.height = "fit-content";

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    // Measure once and lock, so tab switching won't change proportions.
    if (!baseSize) {
      const { cw, ch } = measure();
      if (cw && ch) baseSize = { cw, ch };
    }

    const cw = baseSize ? baseSize.cw : measure().cw;
    const ch = baseSize ? baseSize.ch : measure().ch;

    if (!vw || !vh || !cw || !ch) return;

    // Keep a little breathing room around the canvas so views don't "touch" edges.
    const PAD = 14;
    const avw = Math.max(0, vw - PAD * 2);
    const avh = Math.max(0, vh - PAD * 2);

    // Allow scaling up AND down, while keeping everything within the padded viewport.
    const s = Math.min(avw / cw, avh / ch);

    const scaledW = cw * s;
    const scaledH = ch * s;

    const tx = Math.max(PAD, (vw - scaledW) / 2);
    const ty = Math.max(PAD, (vh - scaledH) / 2);

    canvas.style.transformOrigin = "top left";
    canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  };

  const rafFit = () => requestAnimationFrame(fit);

  window.addEventListener("layout-refit", () => {
    baseSize = null;
    canvas.style.height = "fit-content";
    rafFit();
  });

  window.addEventListener("resize", rafFit, { passive: true });
  window.addEventListener("load", rafFit, { passive: true });

  // Re-fit after fonts/images settle
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(rafFit).catch(() => {});
  }

  // Initial
  // Run twice: once immediately, once after layout settles.
  rafFit();
  setTimeout(rafFit, 60);
})();

