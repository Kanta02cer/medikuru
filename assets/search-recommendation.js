/* A fictional ChatGPT-style search example. No AI calls or external requests. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-mk-search-demo]').forEach((demo, index) => {
    const replay = demo.querySelector('[data-mk-search-replay]');
    const sourceButton = demo.querySelector('[data-mk-search-source]');
    const sourceCard = demo.querySelector('.mk-search-demo__source-card');
    const scene = demo.querySelector('.mk-search-demo__scene') || demo;
    let timer;
    let played = false;
    const setSource = (open) => {
      if (!sourceButton || !sourceCard) return;
      sourceCard.hidden = !open;
      sourceButton.setAttribute('aria-expanded', String(open));
      sourceButton.querySelector('.mk-search-demo__source-chevron').textContent = open ? '⌃' : '⌄';
    };
    if (sourceButton && sourceCard) {
      sourceCard.id = `mk-chatgpt-source-card-${index + 1}`;
      sourceButton.setAttribute('aria-controls', sourceCard.id);
      sourceButton.addEventListener('click', () => {
        setSource(sourceButton.getAttribute('aria-expanded') !== 'true');
      });
    }
    const finish = () => {
      window.clearTimeout(timer);
      demo.classList.remove('is-playing');
      if (replay) replay.disabled = false;
    };
    const play = () => {
      finish();
      setSource(true);
      played = true;
      if (reduced.matches) return;
      void demo.offsetWidth;
      demo.classList.add('is-playing');
      if (replay) replay.disabled = true;
      timer = window.setTimeout(finish, 3500);
    };
    if (replay) {
      replay.hidden = reduced.matches;
      replay.addEventListener('click', play);
    }
    reduced.addEventListener('change', () => {
      finish();
      if (replay) replay.hidden = reduced.matches;
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (!played && entries.some((entry) => entry.isIntersecting)) {
          play();
          observer.disconnect();
        }
      }, { threshold: 0.45 });
      observer.observe(scene);
    } else {
      play();
    }
  });
})();
