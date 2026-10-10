(() => {
  const style = document.createElement('style');
  style.textContent = `
.sample-dialog{overflow:auto;overscroll-behavior:contain}.sample-dialog .sample-report-sheet{margin:30px 0 38px}.sample-dialog .sample-report-sheet figcaption{font-size:12px;font-weight:700;color:#8d7337;line-height:1.8;border-bottom:1px solid #d9ceb6;padding-bottom:10px;letter-spacing:.03em}.sample-dialog .sample-report-sheet img{margin:14px 0 0}.sample-dialog .report-complete{padding:14px 16px;background:#eee9dc;border-radius:6px}
  .sample-dialog{border:0;border-radius:16px;padding:0;width:min(980px,calc(100% - 28px));max-height:92vh;background:#f7f5ef;color:#162d53;box-shadow:0 35px 100px #071b3e55;font:inherit}
  .sample-dialog::backdrop{background:#081c37b8;backdrop-filter:blur(5px)}
  .sample-dialog .sample-head{position:sticky;top:0;background:#f7f5eff5;display:flex;align-items:center;justify-content:space-between;gap:15px;padding:20px 25px;border-bottom:1px solid #ded7c8;z-index:1}
  .sample-dialog h2{font:700 19px/1.5 'Noto Sans JP',sans-serif;margin:0}
  .sample-dialog .sample-close{border:1px solid #c9c5ba;background:transparent;color:#162d53;border-radius:50%;width:38px;height:38px;font-size:22px;cursor:pointer;flex-shrink:0}
  .sample-dialog .sample-body{padding:24px;max-width:790px;margin:auto}.sample-dialog p{font-size:12px;line-height:1.9;color:#667085}.sample-dialog img{display:block;width:100%;height:auto;box-shadow:0 6px 24px #14243d16;margin:18px 0 24px}.sample-dialog details{border-top:1px solid #d6d0c2;padding:18px 0}.sample-dialog summary{font-size:14px;font-weight:600;cursor:pointer}.sample-dialog .sample-pdf{color:#162d53;font-size:13px;text-underline-offset:5px}.sample-dialog button:focus-visible,.sample-dialog a:focus-visible,.sample-dialog summary:focus-visible{outline:3px solid #b29143;outline-offset:4px}
  @media(max-width:600px){.sample-dialog .sample-head{padding:16px}.sample-dialog h2{font-size:16px}.sample-dialog .sample-body{padding:16px}}
  `;
  document.head.append(style);
  const dialog=document.createElement('dialog');dialog.className='sample-dialog';dialog.setAttribute('aria-labelledby','sample-title');
  dialog.innerHTML=`<div class="sample-head"><h2 id="sample-title">AI検索ブランディング診断レポート</h2><button type="button" class="sample-close" aria-label="閉じる">×</button></div><div class="sample-body"><p>メディくる自身の診断例です。ご相談後は、診断対象に合わせた専用レポートをお渡しします。</p><p class="report-complete">全5ページを省略せず掲載しています。<br><a href="assets/report-sample.pdf?v=evidence-20261004" download>全5ページのPDFを保存 ↓</a></p>${['診断サマリー','GPT・Geminiの評価比較','改善の進め方と試算','Geminiの採点根拠','GPTの採点根拠'].map((label,i)=>`<figure class="sample-report-sheet"><figcaption>${String(i+1).padStart(2,'0')} / 05　${label}</figcaption><img src="assets/report-hq-${i+1}.png" width="1075" height="1521" loading="${i===0?'eager':'lazy'}" alt="${i+1}ページ目：${label}"></figure>`).join('')}<p><a class="sample-pdf" href="assets/report-sample.pdf?v=evidence-20261004" download>サンプルPDFを保存 ↓</a></p><p>現在のスコアは取得したAI回答に基づく独自の参考評価です。改善後の数値は条件付きの試算で、成果を保証するものではありません。</p></div>`;
  document.body.append(dialog);
  let trigger;
  document.querySelectorAll('[data-open-report]').forEach(b=>b.addEventListener('click',()=>{trigger=b;if(document.documentElement.classList.contains('is-embedded')){window.parent.postMessage({type:'benefit-report-preview'},location.origin);return;}dialog.showModal();dialog.scrollTop=0;dialog.querySelector('.sample-close').focus();}));
  dialog.querySelector('.sample-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  dialog.addEventListener('close',()=>trigger?.focus());
  if(document.documentElement.classList.contains('is-embedded')){
    let previousHeight=0;
    const resize=()=>{const h=Math.ceil(document.body.getBoundingClientRect().height);if(h!==previousHeight){previousHeight=h;window.parent.postMessage({type:'benefit-height',height:h},location.origin)}};
    window.addEventListener('message',e=>{if(e.source===window.parent&&e.origin===location.origin&&e.data?.type==='benefit-request-height')window.parent.postMessage({type:'benefit-height',height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin)});new ResizeObserver(resize).observe(document.body);window.addEventListener('load',resize);document.fonts.ready.then(resize);
    document.querySelectorAll('a[href="#consultation-flow"]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();window.parent.postMessage({type:'benefit-consultation-preview'},location.origin)}));
  }

})();
