/* Homepage diagrams reveal once; research charts replay on a fresh viewport entry.
   Text, published values and navigation remain unchanged. */
(() => {
  'use strict';

  const start = () => {
    if (!document.body.classList.contains('corporate')) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || !('IntersectionObserver' in window)) return;

    const targets = document.querySelectorAll([
      '.strategy-hero-visual',
      '.official-media-strip .official-media-logos',
      '#services .hp-value-pillars',
      '#services .service-grid',
      '#branding .branding-equation .branding-operand',
      '#branding .branding-equation .branding-multiply',
      '#branding .branding-journey-steps > li',
      '#research .review-data',
      '#research .future-graphic',
      '#news-comparison .interview-process',
      '#ai-comparison .citation-targets',
      '#ai-comparison .three-pillars',
      '#simulation .model-future-charts figure',
      '#pricing .price-grid',
      '#pricing .process-grid',
      '#pricing .strategy-roi__math'
    ].join(','));
    // The longest CSS sequence ends at 3360ms; keep its fill until it finishes.
    const playbackCleanupMs = 4000;
    const timers = new Map();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target;
        observer.unobserve(target);
        if (reduced.matches) continue;
        target.classList.add('hp-motion-play');
        timers.set(target, window.setTimeout(() => {
          target.classList.remove('hp-motion-play');
          timers.delete(target);
        }, playbackCleanupMs));
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -18% 0px' });

    targets.forEach(target => observer.observe(target));

    // Observe the actual plots. A tall card can enter before its bars are visible.
    const charts = document.querySelectorAll('#research .review-data > .donut, #research .adoption-card > .bar-chart');
    const visibleCharts = new Set();
    const chartRuns = new Map();
    const finishChart = (target) => {
      const run = chartRuns.get(target);
      if (run) {
        window.cancelAnimationFrame(run.frame);
        window.clearTimeout(run.timer);
      }
      target.classList.remove('hp-chart-play');
      target.style.removeProperty('--hp-donut-progress');
      target.closest('.adoption-card')?.classList.remove('hp-chart-playing');
      chartRuns.delete(target);
    };
    const playChart = (target) => {
      finishChart(target);
      const isDonut = target.classList.contains('donut');
      const percentage = isDonut ? Number.parseFloat(target.querySelector('strong')?.textContent) : 0;
      if (isDonut && !Number.isFinite(percentage)) return;
      const run = { frame: 0, timer: 0 };
      chartRuns.set(target, run);
      if (isDonut) target.style.setProperty('--hp-donut-progress', '0%');
      target.classList.add('hp-chart-play');
      target.closest('.adoption-card')?.classList.add('hp-chart-playing');
      if (isDonut) {
        let startedAt;
        const draw = (now) => {
          if (startedAt === undefined) startedAt = now;
          const progress = Math.min((now - startedAt) / 2600, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          target.style.setProperty('--hp-donut-progress', `${percentage * eased}%`);
          if (progress < 1) run.frame = window.requestAnimationFrame(draw);
          else finishChart(target);
        };
        run.frame = window.requestAnimationFrame(draw);
      } else {
        // Bars: 2400ms + 450ms stagger; result emphasis ends at 3030ms.
        run.timer = window.setTimeout(() => finishChart(target), 3300);
      }
    };
    const chartObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target;
        if (!entry.isIntersecting) {
          visibleCharts.delete(target);
          finishChart(target);
          continue;
        }
        const threshold = target.classList.contains('donut') ? 0.45 : 0.85;
        if (entry.intersectionRatio < threshold || visibleCharts.has(target) || reduced.matches) continue;
        visibleCharts.add(target);
        playChart(target);
      }
    }, { threshold: [0, 0.45, 0.85], rootMargin: '-70px 0px -12% 0px' });
    charts.forEach(target => chartObserver.observe(target));

    reduced.addEventListener('change', () => {
      if (!reduced.matches) return;
      observer.disconnect();
      chartObserver.disconnect();
      charts.forEach(finishChart);
      visibleCharts.clear();
      timers.forEach((timer, target) => {
        window.clearTimeout(timer);
        target.classList.remove('hp-motion-play');
      });
      timers.clear();
    }, { once: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
