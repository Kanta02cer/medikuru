/* Approved report fan motion, 2026-10-04. The static composition is the fallback. */
(() => {
  'use strict';
  const stages = [...document.querySelectorAll('.gift-booklet-stage')];
  if (!('IntersectionObserver' in window) || !('animate' in Element.prototype)) {
    stages.forEach(stage => { stage.dataset.reportMotion = 'static'; });
    return;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) {
    stages.forEach(stage => { stage.dataset.reportMotion = 'reduced'; });
    return;
  }

  stages.forEach(stage => {
    const sheets = [5, 4, 3, 2, 1].map(page => stage.querySelector(`.gift-sheet-${page}`));
    if (sheets.some(img => !img)) return;
    let consumed = false;
    let stopped = false;
    let animations = [];
    let readyTimer;
    let watchdog;
    let observer;

    function removeListeners() {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onReduced);
      stage.removeEventListener('click', onOpen);
    }

    function restore(state = 'static') {
      stopped = true;
      clearTimeout(readyTimer);
      clearTimeout(watchdog);
      animations.forEach(animation => animation.cancel());
      animations = [];
      observer.disconnect();
      removeListeners();
      stage.dataset.reportMotion = state;
    }

    function onResize() { if (consumed) restore(); }
    function onVisibility() { if (document.hidden && consumed) restore(); }
    function onReduced() { if (reduced.matches) restore(); }
    // Do not prevent or replace the existing report-sample click handler.
    function onOpen() { restore(); }

    async function playOnce() {
      consumed = true;
      observer.unobserve(stage);
      stage.dataset.reportMotion = 'waiting';
      try {
        const decoded = sheets.map(img => typeof img.decode === 'function'
          ? img.decode()
          : (img.complete && img.naturalWidth > 0 ? Promise.resolve() : Promise.reject()));
        await Promise.race([
          Promise.all([document.fonts ? document.fonts.ready : Promise.resolve(), ...decoded]),
          new Promise((_, reject) => {
            readyTimer = setTimeout(() => reject(new Error('Report images were not ready')), 5000);
          })
        ]);
        clearTimeout(readyTimer);
        if (stopped) return;
        if (reduced.matches || document.hidden || sheets.some(img => img.naturalWidth === 0)) {
          restore();
          return;
        }
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        if (!width || !height) { restore(); return; }
        const positions = sheets.map(img => ({
          img,
          end: getComputedStyle(img).transform,
          dx: width * .5 - img.offsetLeft - img.offsetWidth / 2,
          dy: height * .47 - img.offsetTop - img.offsetHeight / 2
        }));
        stage.dataset.reportMotion = 'playing';
        // Sheets only: preserve the stage position, including LP's .4% optical centering.
        // Close in 230 ms, hold 180 ms, then unfold 5 -> 1 with a 100 ms stagger.
        positions.forEach(({img, end, dx, dy}, index) => {
          const stacked = `translate(${dx}px, ${dy}px) rotate(0deg) scale(.98)`;
          const start = 410 + index * 100;
          const duration = start + 850;
          animations.push(img.animate([
            {transform: end, offset: 0, easing: 'cubic-bezier(.4,0,.2,1)'},
            {transform: stacked, offset: 230 / duration},
            {transform: stacked, offset: start / duration, easing: 'cubic-bezier(.2,.75,.2,1)'},
            {transform: end, offset: 1}
          ], {duration, fill: 'none'}));
        });
        watchdog = setTimeout(() => restore(), 2400);
        await Promise.all(animations.map(animation => animation.finished));
        if (!stopped) restore('complete');
      } catch (_) {
        // A decode, layout, or animation failure must never hide or leave sheets stacked.
        restore();
      }
    }

    // A null root uses the browser's implicit viewport and clips through the embedding
    // iframe. Observe the booklet itself, not the much taller report document/frame.
    observer = new IntersectionObserver(entries => {
      if (consumed || stopped) return;
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .6)) {
        playOnce();
      }
    }, {root: null, threshold: .6});
    window.addEventListener('resize', onResize, {passive: true});
    document.addEventListener('visibilitychange', onVisibility);
    reduced.addEventListener('change', onReduced);
    stage.addEventListener('click', onOpen);
    stage.dataset.reportMotion = 'idle';
    observer.observe(stage);
  });
})();
