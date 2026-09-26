(function () {
  'use strict';

  const counters = Array.from(document.querySelectorAll('[data-count-up]'));
  if (counters.length === 0) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cleanupTasks = [];

  const prepareCounter = (counter) => {
    const target = Number(counter.dataset.countUp);
    const requestedDuration = Number(counter.dataset.countDuration);
    const duration = Number.isFinite(requestedDuration) && requestedDuration > 0
      ? requestedDuration
      : 2400;
    const valueNode = counter.querySelector('[data-count-value]');
    const tens = counter.querySelector('[data-count-tens]');
    const ones = counter.querySelector('[data-count-ones]');

    if (!Number.isFinite(target) || (!valueNode && (!tens || !ones))) return null;

    let started = false;
    let animationFrame = 0;
    let startTimer = 0;
    let startedAt = 0;
    let lastValue = -1;

    const renderValue = (value) => {
      const safeValue = Math.max(0, Math.min(target, value));
      if (safeValue === lastValue) return;

      if (valueNode) {
        valueNode.textContent = String(safeValue);
      } else {
        const digits = String(safeValue);
        tens.textContent = digits.length > 1 ? digits.slice(0, -1) : '';
        ones.textContent = digits.slice(-1);
      }
      lastValue = safeValue;
    };

    const finish = () => renderValue(target);

    if (prefersReducedMotion) {
      finish();
      return { start: finish, cleanup: function () {} };
    }

    renderValue(0);

    const countUp = (time) => {
      if (!startedAt) startedAt = time;
      const progress = Math.min((time - startedAt) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      renderValue(Math.floor(target * easedProgress));

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(countUp);
      } else {
        finish();
      }
    };

    const start = () => {
      if (started) return;
      started = true;
      startTimer = window.setTimeout(() => {
        animationFrame = window.requestAnimationFrame(countUp);
      }, 180);
    };

    return {
      start,
      cleanup: () => {
        window.clearTimeout(startTimer);
        window.cancelAnimationFrame(animationFrame);
      },
    };
  };

  const preparedCounters = counters
    .map((counter) => ({ counter, animation: prepareCounter(counter) }))
    .filter(({ animation }) => animation !== null);

  if (!('IntersectionObserver' in window)) {
    preparedCounters.forEach(({ animation }) => animation.start());
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const prepared = preparedCounters.find(({ counter }) => counter === entry.target);
        if (!prepared) return;
        observer.unobserve(entry.target);
        prepared.animation.start();
      });
    },
    {
      threshold: 0.35,
      rootMargin: '0px 0px -8% 0px',
    },
  );

  preparedCounters.forEach(({ counter, animation }) => {
    observer.observe(counter);
    cleanupTasks.push(animation.cleanup);
  });

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    cleanupTasks.forEach((cleanup) => cleanup());
  }, { once: true });
}());
