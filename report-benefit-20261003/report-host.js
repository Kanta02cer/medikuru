(() => {
  const base=new URL('.',document.currentScript.src);
  const frame=document.querySelector('#report-benefit-frame');
  if(!frame)return;
  let modal;
  function showReport(){
    if(!modal){
      modal=document.createElement('dialog');modal.className='report-sample-dialog';modal.setAttribute('aria-labelledby','report-sample-title');
      const url=name=>new URL('assets/'+name,base).href;
      const labels=['診断サマリー','GPT・Geminiの評価比較','改善の進め方と試算','Geminiの採点根拠','GPTの採点根拠'];
      modal.innerHTML=`<div class="report-dialog-head"><h2 id="report-sample-title">AI検索ブランディング診断レポート</h2><button class="report-close" type="button" aria-label="レポートを閉じる">×</button></div><div class="report-dialog-body"><p>掲載画像はメディくる自身の診断例です。無料相談にご参加いただいた方へ、御社専用の診断レポートをお渡しします。</p><p class="report-complete">サンプル全5ページ<br><a href="${url('report-sample.pdf')}" download>全5ページのPDFを保存</a></p>${labels.map((label,i)=>`<figure class="sample-report-sheet"><figcaption>${String(i+1).padStart(2,'0')} / 05　${label}</figcaption><img src="${url('report-0'+(i+1)+'.png')}" width="1075" height="1521" loading="${i===0?'eager':'lazy'}" alt="${i+1}ページ目：${label}"></figure>`).join('')}<p>スコアは独自の参考評価です。改善後の数値は条件付きの試算です。</p><a href="${url('report-sample.pdf')}" download>サンプルPDFを保存</a></div>`;
      document.body.append(modal);
      modal.querySelector('.report-close').addEventListener('click',()=>modal.close());
      modal.addEventListener('click',e=>{if(e.target===modal)modal.close()});
      modal.addEventListener('close',()=>frame.focus());
    }
    modal.showModal();modal.scrollTop=0;modal.querySelector('.report-close').focus();
  }
  window.addEventListener('message',e=>{
    if(e.source!==frame.contentWindow||e.origin!==location.origin)return;
    if(e.data?.type==='benefit-height'&&Number.isFinite(e.data.height))frame.style.height=(Math.ceil(Math.min(10000,Math.max(300,e.data.height)))+2)+'px';
    else if(e.data?.type==='benefit-report-preview')showReport();
  });
  const requestHeight=()=>frame.contentWindow.postMessage({type:'benefit-request-height'},location.origin);
  frame.addEventListener('load',requestHeight);requestHeight();
  const fixed=document.querySelector('.lp-fixed-cta');
  const first=document.querySelector('[data-medikuru-line-cta="hero"]')?.closest('.cta');
  if(fixed&&first){
    let task=0;
    const update=()=>{task=0;fixed.hidden=first.getBoundingClientRect().bottom>0};
    const schedule=()=>{if(!task)task=requestAnimationFrame(update)};
    window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('load',schedule,{once:true});new ResizeObserver(schedule).observe(first);update();
  }
})();
