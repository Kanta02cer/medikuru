(() => {
  "use strict";
  const initialize = () => {
    document.querySelectorAll(".search-stat").forEach((section) => {
      if (section.dataset.searchStatReady === "true") return;
      const number = section.querySelector("[data-search-stat-number]");
      const circle = section.querySelector(".search-stat__progress");
      const people = [...section.querySelectorAll(".search-stat__person")];
      const replay = section.querySelector("[data-search-stat-replay]");
      if (!number || !circle || !replay) return;
      section.dataset.searchStatReady = "true";
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let frame = 0;
      let observer;
      const paint = (value) => {
        const rounded = Math.round(value * 10) / 10;
        number.textContent = String(rounded);
        circle.setAttribute("stroke-dasharray", `${value} 100`);
        people.forEach((person, index) => person.classList.toggle("is-active", index < Math.floor(rounded / 10)));
      };
      const play = () => {
        window.cancelAnimationFrame(frame);
        if (observer) observer.disconnect();
        if (motion.matches) {
          paint(70.1);
          return;
        }
        paint(0);
        const start = performance.now();
        const duration = 1550;
        const tick = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          paint(70.1 * eased);
          if (progress < 1) frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
      };
      replay.hidden = motion.matches;
      replay.addEventListener("click", play);
      const onMotionChange = () => {
        replay.hidden = motion.matches;
        if (motion.matches) {
          window.cancelAnimationFrame(frame);
          if (observer) observer.disconnect();
          paint(70.1);
        }
      };
      if (typeof motion.addEventListener === "function") motion.addEventListener("change", onMotionChange);
      if (motion.matches) return;
      paint(0);
      if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) play();
        }, { threshold: 0.35 });
        observer.observe(section);
      } else {
        play();
      }
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
