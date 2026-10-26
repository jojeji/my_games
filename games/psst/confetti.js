// Simple canvas confetti. Does nothing for prefers-reduced-motion.
export function confetti(canvas, { ms = 3500, colors = ['#ff5a4d', '#ffb02e', '#2563eb', '#12915b', '#8b3fc8', '#fff'] } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => {
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  };
  resize();
  const W = () => canvas.width;
  const parts = Array.from({ length: 110 }, () => ({
    x: Math.random() * W(),
    y: -Math.random() * canvas.height * 0.6,
    vx: (Math.random() - 0.5) * 2.2 * dpr,
    vy: (1.5 + Math.random() * 3) * dpr,
    s: (5 + Math.random() * 7) * dpr,
    r: Math.random() * 6.28,
    vr: (Math.random() - 0.5) * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  let raf = 0;
  const frame = (t) => {
    const age = t - t0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (ms - age) / 800));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (age < ms) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
