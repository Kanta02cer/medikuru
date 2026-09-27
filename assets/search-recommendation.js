/* A looping, non-scrollable explanation. The full example remains readable without motion. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-mk-search-demo]').forEach(demo => {
    const toggle = demo.querySelector('[data-mk-search-replay]');
    const scene = demo.querySelector('.mk-search-demo__scene');
    const viewport = demo.querySelector('.mk-search-demo__viewport');
    const targets = ['query', 'response', 'source-cards', 'destination']
      .map(name => demo.querySelector(`.mk-search-demo__${name}`));
    if (!scene || !viewport || targets.some(target => !target)) return;
    let timers = [];
    let visible = false;
    let paused = false;
    let step = 1;
    const clearTimers = () => {
      timers.forEach(id => window.clearTimeout(id));
      timers = [];
    };
    const later = (callback, delay) => timers.push(window.setTimeout(callback, delay));
    const canPlay = () => visible && !paused && !document.hidden && !reduced.matches;
    const position = () => {
      if (reduced.matches) return;
      const target = targets[step - 1];
      const top = target.getBoundingClientRect().top - scene.getBoundingClientRect().top;
      const limit = Math.max(0, scene.offsetHeight - viewport.clientHeight);
      const shift = step === 1 ? 0 : Math.min(limit, Math.max(0, top - 20));
      scene.style.transform = `translateY(${-shift}px)`;
    };
    const showStep = number => {
      step = number;
      demo.dataset.mkStep = String(number);
      targets.forEach((target, index) => {
        target.dataset.mkFocus = String(index === number - 1);
      });
      position();
    };
    const updateToggle = () => {
      if (!toggle) return;
      toggle.hidden = reduced.matches;
      toggle.disabled = false;
      toggle.textContent = paused ? '▶ 再生' : 'Ⅱ 一時停止';
      toggle.setAttribute('aria-label', paused ? '検索の流れを再生' : '検索の流れを一時停止');
    };
    const play = () => {
      clearTimers();
      if (!canPlay()) return;
      demo.classList.add('is-playing', 'is-motion-ready');
      demo.classList.remove('is-resetting');
      showStep(1);
      later(() => showStep(2), 1400);
      later(() => showStep(3), 3100);
      later(() => showStep(4), 5200);
      later(() => {
        demo.classList.add('is-resetting');
        later(() => {
          showStep(1);
          later(play, 100);
        }, 260);
      }, 8000);
    };
    const sync = () => {
      clearTimers();
      demo.classList.toggle('is-motion-ready', !reduced.matches);
      if (reduced.matches) {
        demo.classList.remove('is-playing', 'is-resetting');
        demo.dataset.mkStep = 'done';
        scene.style.transform = '';
        targets.forEach(target => delete target.dataset.mkFocus);
      } else if (paused) {
        demo.classList.remove('is-resetting');
      } else if (canPlay()) {
        play();
      }
      updateToggle();
    };
    toggle?.addEventListener('click', () => { paused = !paused; sync(); });
    reduced.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    if ('ResizeObserver' in window) new ResizeObserver(position).observe(viewport);
    sync();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        visible = entries.some(entry => entry.isIntersecting);
        sync();
      }, { threshold: 0.1 }).observe(demo.querySelector('.mk-search-demo__figure'));
    } else {
      visible = true;
      sync();
    }
  });
})();
