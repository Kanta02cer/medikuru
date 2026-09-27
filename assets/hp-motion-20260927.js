/* One-time reveal for homepage diagrams. No text, values or navigation are changed. */
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
      '#research .adoption-card',
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
    reduced.addEventListener('change', () => {
      if (!reduced.matches) return;
      observer.disconnect();
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
