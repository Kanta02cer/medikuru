
(() => {
  'use strict';
  const menu = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  const setMenu = open => { if (!menu || !nav) return; menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); document.body.classList.toggle('hp-menu-open', open); menu.querySelector('.visually-hidden').textContent = open ? 'メニューを閉じる' : 'メニューを開く'; };
  menu?.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  const dialog = document.querySelector('#consult-dialog');
  let lastTrigger = null;
  document.querySelectorAll('[data-consult]').forEach(button => button.addEventListener('click', () => { lastTrigger = button; setMenu(false); dialog?.showModal(); }));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog?.close()));
  dialog?.addEventListener('click', e => { if(e.target === dialog) { const box = dialog.getBoundingClientRect(); if(e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) dialog.close(); } });
  dialog?.addEventListener('close', () => lastTrigger?.focus());
  document.addEventListener('keydown', e => { if(e.key === 'Escape') setMenu(false); });
  document.querySelectorAll('[data-calculator]').forEach(calculator => { const slider = calculator.querySelector('input'); const update = () => { const profit = Number(slider.value); calculator.querySelector('[data-profit-value]').textContent = `${profit}万円`; calculator.querySelector('[data-ai-deals]').textContent = Math.ceil(18 / profit); calculator.querySelector('[data-first-deals]').textContent = Math.ceil(48 / profit); slider.setAttribute('aria-valuetext', `1件あたりの限界利益${profit}万円`); }; slider.addEventListener('input', update); update(); });

  document.querySelectorAll('[data-future-chart]').forEach(chart => {
    chart.querySelectorAll('[data-future-control]').forEach(button => button.addEventListener('click', () => {
      const scenario = button.dataset.futureControl;
      chart.querySelectorAll('[data-future-control]').forEach(b => { const active = b === button; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active)); });
      chart.querySelectorAll('[data-future-line]').forEach(line => { const active = line.dataset.futureLine === scenario; line.setAttribute('stroke-width',active?'3.5':'1.6'); line.setAttribute('opacity',active?'1':'.55'); });
      chart.querySelector('[data-future-result]').innerHTML = `${scenario === 'half' ? '89.0' : '63.2'}<small>%</small>`;
      chart.querySelector('[data-future-assumption]').textContent = `直近の平均増加幅の${scenario === 'half' ? '半分' : '4分の1'}が続くと仮定`;
    }));
  });
})();
