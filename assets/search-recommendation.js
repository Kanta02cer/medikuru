/* A readable four-step explanation. Both cited routes remain visible without JS. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-mk-search-demo]').forEach(demo => {
    const replay = demo.querySelector('[data-mk-search-replay]');
    const scene = demo.querySelector('.mk-search-demo__scene') || demo;
    const chatWindow = demo.querySelector('.mk-search-demo__chat-window');
    const query = demo.querySelector('.mk-search-demo__query');
    const answer = demo.querySelector('.mk-search-demo__recommend');
    const sourceCards = demo.querySelector('.mk-search-demo__source-cards');
    const destination = demo.querySelector('.mk-search-demo__destination');
    const sources = [...demo.querySelectorAll('[data-mk-search-source]')].map(button => ({
      button,
      card: demo.querySelector(`#${button.getAttribute('aria-controls')}`)
    })).filter(pair => pair.card);
    let timers = [];
    let played = false;
    let scrollFrame = null;
    const cancelPullUp = () => {
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      scrollFrame = null;
    };
    const showSource = ({ button, card }, open) => {
      card.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      const chevron = button.querySelector('.mk-search-demo__source-chevron');
      if (chevron) chevron.textContent = open ? '⌃' : '⌄';
    };
    sources.forEach(pair => pair.button.addEventListener('click', () => {
      showSource(pair, pair.button.getAttribute('aria-expanded') !== 'true');
    }));
    const clear = () => {
      timers.forEach(id => window.clearTimeout(id));
      timers = [];
      cancelPullUp();
      demo.classList.remove('is-playing');
      if (replay) replay.disabled = false;
    };
    const finish = () => {
      clear();
      demo.dataset.mkStep = 'done';
    };
    const pullUpTo = target => {
      cancelPullUp();
      if (!target || !chatWindow || chatWindow.scrollHeight <= chatWindow.clientHeight + 1) return;
      const transform = window.getComputedStyle(target).transform;
      const visualShift = transform !== 'none' && window.DOMMatrixReadOnly
        ? new window.DOMMatrixReadOnly(transform).m42 : 0;
      const top = chatWindow.scrollTop + target.getBoundingClientRect().top
        - chatWindow.getBoundingClientRect().top - visualShift
        - Math.min(86, chatWindow.clientHeight * .18);
      const limit = Math.max(0, chatWindow.scrollHeight - chatWindow.clientHeight);
      const goal = Math.min(limit, Math.max(0, top));
      const start = chatWindow.scrollTop;
      const distance = goal - start;
      if (Math.abs(distance) < 1) {
        chatWindow.scrollTop = goal;
        return;
      }
      let startedAt = null;
      const animate = now => {
        if (startedAt === null) startedAt = now;
        const progress = Math.min(1, (now - startedAt) / 700);
        const eased = progress < .5
          ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
        chatWindow.scrollTop = start + distance * eased;
        if (progress < 1) {
          scrollFrame = window.requestAnimationFrame(animate);
        } else {
          chatWindow.scrollTop = goal;
          scrollFrame = null;
        }
      };
      scrollFrame = window.requestAnimationFrame(animate);
    };
    const play = () => {
      clear();
      sources.forEach(pair => showSource(pair, true));
      played = true;
      if (chatWindow) chatWindow.scrollTop = 0;
      if (reduced.matches) {
        demo.dataset.mkStep = 'done';
        return;
      }
      demo.classList.add('is-playing');
      if (replay) replay.disabled = true;
      demo.dataset.mkStep = '1';
      pullUpTo(query);
      timers.push(window.setTimeout(() => { demo.dataset.mkStep = '2'; pullUpTo(answer); }, 1400));
      timers.push(window.setTimeout(() => { demo.dataset.mkStep = '3'; pullUpTo(sourceCards); }, 3100));
      timers.push(window.setTimeout(() => { demo.dataset.mkStep = '4'; pullUpTo(destination); }, 5200));
      timers.push(window.setTimeout(finish, 8000));
    };
    if (replay) {
      replay.hidden = reduced.matches;
      replay.addEventListener('click', play);
    }
    if (chatWindow) {
      ['wheel', 'touchstart', 'pointerdown'].forEach(type => chatWindow.addEventListener(type, () => {
        if (demo.classList.contains('is-playing')) finish();
      }, { passive: true }));
    }
    reduced.addEventListener('change', () => {
      finish();
      if (replay) replay.hidden = reduced.matches;
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (!played && entries.some(entry => entry.isIntersecting)) {
          play();
          observer.disconnect();
        }
      }, { threshold: 0.35 });
      observer.observe(demo.querySelector('.mk-search-demo__flow') || scene);
    } else {
      play();
    }
  });
})();
