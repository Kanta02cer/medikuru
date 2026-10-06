/* Local scenario model. No network requests, data storage or submissions. */
(function () {
  'use strict';
  const DEFAULTS = Object.freeze({inquiries:30,cost:20000,close:10,order:500000,margin:40,news:20,ai:37.4,recognition:80,multiplier:1.6,citation:50,costMode:'cpl',futureSpeed:.5,entryMode:'direct',budget:600000,budgetCost:20000,costScope:'advertising',payment:'annual'});
  function baseline(input) {
    const r=input.close/100;
    const budgetMode=input.entryMode==='budget';
    const cpl=budgetMode?input.budgetCost:(input.costMode==='cac'?(r>0?input.cost*r:null):input.cost);
    const monthlyInquiries=budgetMode?(cpl>0?input.budget/cpl:null):input.inquiries;
    const monthlyCost=budgetMode?input.budget:(cpl===null?null:monthlyInquiries*cpl);
    return {cpl,monthlyInquiries,monthlyCost,costScope:budgetMode?'advertising':input.costScope};
  }
  function calculate(input, aiOverride) {
    const base=baseline(input);
    const a=(aiOverride===undefined?input.ai:aiOverride)/100;
    const d=input.news/100,c=input.citation/100,v=input.recognition/100,r=input.close/100;
    const exposure=d+(1-d)*a*c*v;
    const uplift=exposure*(input.multiplier-1);
    const baseAnnualInquiries=base.monthlyInquiries===null?null:base.monthlyInquiries*12;
    const annualInquiries=baseAnnualInquiries===null?null:baseAnnualInquiries*(1+uplift);
    const additionalInquiries=baseAnnualInquiries===null?null:baseAnnualInquiries*uplift;
    const additionalDeals=additionalInquiries===null?null:additionalInquiries*r;
    const revenue=additionalDeals===null?null:additionalDeals*input.order;
    const contribution=revenue===null?null:revenue*input.margin/100;
    const cpl=base.cpl;
    const equivalent=cpl===null||additionalInquiries===null?null:additionalInquiries*cpl;
    const annualExistingCost=base.monthlyCost===null?null:base.monthlyCost*12;
    const aiMonthlyFee=15000;
    const annualAiCost=aiMonthlyFee*12;
    const firstYearCost=input.payment==='monthly'?660000:550000;
    const annualInclusiveCost=annualExistingCost===null?null:annualExistingCost+firstYearCost;
    const existingCplAfter=annualInquiries>0&&annualExistingCost!==null?annualExistingCost/annualInquiries:null;
    const inclusiveCpl=annualInquiries>0&&annualInclusiveCost!==null?annualInclusiveCost/annualInquiries:null;
    const inclusiveImprovement=cpl>0&&inclusiveCpl!==null?1-inclusiveCpl/cpl:null;
    return {ai:a*100,exposure,uplift,additionalInquiries,additionalDeals,revenue,contribution,cpl,equivalent,netContribution:contribution===null?null:contribution-firstYearCost,costRatio:equivalent===null?null:equivalent/firstYearCost,serviceCost:firstYearCost,aiMonthlyFee,annualAiCost,baseMonthlyInquiries:base.monthlyInquiries,baseAnnualInquiries,annualInquiries,annualExistingCost,annualInclusiveCost,existingCplAfter,inclusiveCpl,inclusiveImprovement,costScope:base.costScope};
  }
  function scenarios(input) {
    return Array.from({length:6},(_,n)=>{
      const a=Math.min(100,input.ai+1.72*12*n*input.futureSpeed);
      const result=calculate(input,a),cost=n===0?result.serviceCost:result.annualAiCost;
      return {...result,year:n===0?'現在':String(2026+n),cost,netContribution:cost===null||result.contribution===null?null:result.contribution-cost,costRatio:cost===null||result.equivalent===null||cost===0?null:result.equivalent/cost};
    });
  }
  const api={DEFAULTS,baseline,calculate,scenarios};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof document==='undefined')return;
  const root=document.querySelector('[data-value-simulator]');
  if(!root)return;
  const state={...DEFAULTS};
  const fmt=(value,digits=1)=>value===null?'—':Number(value).toLocaleString('ja-JP',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const man=value=>value===null?null:value/10000;
  const signed=(value,digits=1)=>`${value>0?'+':''}${fmt(value,digits)}`;
  const put=(key,value,negative=false)=>{
    root.querySelectorAll(`[data-model-output="${key}"]`).forEach(el=>{el.textContent=value;el.classList.toggle('model-value-negative',negative);});
  };
  function chart(rows,key,label) {
    const raw=rows.map(row=>row[key]);
    if(raw.some(value=>value===null))return '<p class="model-output-note">現在の予算・単価から基準値を算出できないため表示しません。入力条件をご確認ください。</p>';
    const values=key==='equivalent'?raw.map(v=>v/10000):raw;
    const lower=Math.min(0,...values),upper=Math.max(0,...values);
    const span=upper-lower||1;
    const rough=span/4;
    const power=Math.pow(10,Math.floor(Math.log10(rough)));
    const step=[1,2,2.5,5,10].map(n=>n*power).find(n=>n>=rough)||power*10;
    let low=Math.floor(lower/step)*step,high=Math.ceil(upper/step)*step;
    if(high===low)high=low+step*4;
    const w=460,h=258,p={left:52,right:25,top:25,bottom:42};
    const x=i=>p.left+i*(w-p.left-p.right)/5;
    const y=value=>p.top+(high-value)/(high-low)*(h-p.top-p.bottom);
    let content=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}。現在${fmt(values[0],1)}、2031年${fmt(values[5],1)}。入力前提の自社試算。"><title>${label}：各年1年間の条件付き試算</title>`;
    const decimals=step<1?1:0;
    for(let value=low;value<=high+step*.01;value+=step){
      const yy=y(value);content+=`<line x1="${p.left}" y1="${yy}" x2="${w-p.right}" y2="${yy}" stroke="${Math.abs(value)<1e-9?'#b6c2c5':'#e9edeb'}"/><text x="${p.left-9}" y="${yy+4}" text-anchor="end" font-size="11" fill="#8a969d">${fmt(value,decimals)}</text>`;
    }
    content+=`<polyline points="${values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="#a78a4e" stroke-width="2.5" stroke-dasharray="6 5"/>`;
    values.forEach((value,i)=>{
      content+=`<circle cx="${x(i)}" cy="${y(value)}" r="${i===0?4.5:4}" fill="${i===0?'#294658':'#a78a4e'}"/><text x="${x(i)}" y="${h-16}" text-anchor="middle" font-size="11" fill="#7b8b94">${rows[i].year}</text>`;
      if(i===0||i===5){const pos=y(value)>h-70?y(value)-12:y(value)+21;content+=`<text x="${x(i)}" y="${pos}" text-anchor="${i===0?'start':'end'}" font-size="14" font-weight="bold" fill="#826b3f">${fmt(value,1)}</text>`;}
    });
    return content+'</svg>';
  }
  function renderFuture(rows){
    root.querySelector('[data-model-chart="inquiries"]').innerHTML=chart(rows,'additionalInquiries','年間の追加問い合わせ件数');
    root.querySelector('[data-model-chart="equivalent"]').innerHTML=chart(rows,'equivalent',state.costScope==='acquisition'&&state.entryMode!=='budget'?'年間の獲得コスト相当額、万円':'年間の広告獲得費相当額、万円');
    const definitions=[
      ['ai','AIで会社を確認する割合',r=>`${fmt(r.ai,1)}%`],
      ['uplift','問い合わせ数の変化',r=>`${signed(r.uplift*100,2)}%`],
      ['inquiries','年間の追加問い合わせ',r=>`${signed(r.additionalInquiries,1)}件`],
      ['equivalent',state.costScope==='acquisition'&&state.entryMode!=='budget'?'獲得コスト相当額':'広告獲得費相当額',r=>r.equivalent===null?'算出不可':`${fmt(man(r.equivalent),2)}万円`],
      ['revenue','年間売上の増加',r=>`${signed(man(r.revenue),2)}万円`],
      ['contribution','年間限界利益の増加',r=>`${signed(man(r.contribution),2)}万円`],
      ['ai-cost','2年目以降の年間サービス費用',r=>`${fmt(r.annualAiCost/10000,0)}万円（税込）`],
      ['cost','その年のサービス費用（初年度は選択した支払方法）',r=>r.cost===null?'算出不可':`${fmt(r.cost/10000,0)}万円（税込）`],
      ['net','費用を引いた限界利益増分',r=>r.netContribution===null?'算出不可':`${signed(man(r.netContribution),2)}万円`],
    ];
    root.querySelector('[data-model-future-table]').innerHTML=definitions.map(([key,label,format])=>`<tr data-row="${key}"><th scope="row">${label}</th>${rows.map(row=>`<td>${format(row)}</td>`).join('')}</tr>`).join('');
  }
  function renderSimple(result){
    const output=(key,text)=>root.querySelectorAll(`[data-simple-output="${key}"]`).forEach(el=>el.textContent=text);
    const rounded=value=>value===null?'—':fmt(Math.round(value),0);
    const yearFive=scenarios(state)[5];
    output('annual-equivalent',rounded(man(result.equivalent)));
    output('annual-revenue',rounded(man(result.revenue)));
    output('annual-inquiries',rounded(result.additionalInquiries));
    output('annual-deals',fmt(result.additionalDeals,1));
    output('current-monthly',result.baseMonthlyInquiries===null?'—':fmt(result.baseMonthlyInquiries,Number.isInteger(result.baseMonthlyInquiries)?0:1));
    output('after-monthly',result.annualInquiries===null?'—':rounded(result.annualInquiries/12));
    output('inclusive-cpl',fmt(man(result.inclusiveCpl),1));
    output('simple-service-cost',fmt(man(result.serviceCost),0));
    output('ai-service-cost',`${fmt(man(result.annualAiCost),0)}万円（税込）`);
    output('simple-service-tax','税込・初年度');
    output('fee-basis',state.payment==='monthly'?'月々払い・初年度12か月分':'初年度一括払い・2か月分無料');
    output('future-equivalent',rounded(man(yearFive.equivalent)));
    output('future-revenue',rounded(man(yearFive.revenue)));
    output('effect-label',`の${result.equivalent<0?'変化':'獲得効果'}〈${result.costScope==='acquisition'?'獲得コスト':'広告獲得費'}への換算〉`);
    const change=result.uplift*100;
    output('assumption',Math.abs(change)<1e-8?'問い合わせ数が変わらないと仮定した参考値です。実測・保証ではありません。':`問い合わせが約${fmt(Math.abs(change),1)}%${change>0?'増える':'減る'}と仮定した参考値です。実測・保証ではありません。`);
    output('grounding','初めて取材記事を持つ会社を想定し、既存の獲得費は据え置いています。詳しい仮定は下で確認・変更できます。');
    const error=result.baseMonthlyInquiries===null?'詳しい条件のCPLが0円のため算出できません。下の条件を調整してください。':result.cpl===null?'CACからの換算条件が不足しています。詳しい条件で成約率などを確認してください。':result.baseMonthlyInquiries===0?'問い合わせが0件のため、費用込みの1件単価は算出できません。':'';
    output('error',error);
    root.querySelectorAll('[data-simple-input]').forEach(input=>{
      const key=input.dataset.simpleInput;
      const raw=key==='inquiries'?result.baseMonthlyInquiries:key==='cost'?result.cpl:state[key];
      const value=raw===null?'':Number((raw/Number(input.dataset.simpleScale)).toFixed(4));
      if(document.activeElement!==input)input.value=value;
      root.querySelectorAll(`[data-simple-preset="${key}"]`).forEach(button=>{
        const active=value!==''&&Math.abs(Number(button.dataset.simpleValue)-Number(value))<.00001;
        button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
      });
    });
  }
  root.querySelector('[data-subscription-payment]')?.addEventListener('change',e=>{state.payment=e.target.value;render();});
  function render(){
    const result=calculate(state);
    const change=(state.multiplier-1)*100;
    const changeText=Math.abs(change)<1e-8?'記事を認識した人の問い合わせ率が変わらない仮定。':`記事を認識した人の問い合わせ率が${fmt(Math.abs(change),0)}%${change>0?'改善':'低下'}する仮定。`;
    const acquisition=result.costScope==='acquisition';
    root.querySelectorAll('[data-model-cost-label]').forEach(el=>{
      el.textContent=el.dataset.modelCostLabel==='long'?(acquisition?'現在の獲得コストに置き換えた相当額':'広告獲得費に置き換えた相当額'):(acquisition?'獲得コスト相当額':'広告獲得費相当額');
    });
    put('multiplier-note',changeText);
    put('uplift',`${signed(result.uplift*100,2)}%`,result.uplift<0);
    put('monthly-total',result.baseMonthlyInquiries===null?'広告費から問い合わせ数を算出できません':`月${fmt(result.baseMonthlyInquiries,1)}件 → ${fmt(result.annualInquiries/12,1)}件と仮定`);
    put('derived-inquiries',result.baseMonthlyInquiries===null?'CPLを0円より大きい金額にしてください。':`基準となる問い合わせ数：月 ${fmt(result.baseMonthlyInquiries,1)}件`);
    put('extra-inquiries',signed(result.additionalInquiries,1),result.additionalInquiries<0);
    put('monthly-extra',result.additionalInquiries===null?'基準となる問い合わせ数が算出できません':`月あたり ${signed(result.additionalInquiries/12,1)}件`);
    put('ad-equivalent',fmt(man(result.equivalent),2),result.equivalent<0);
    put('cpl-description',result.cpl===null?'成約率0%のためCAC換算は算出不可':`追加問い合わせ × CPL ${fmt(result.cpl,0)}円${state.costMode==='cac'&&state.entryMode!=='budget'?'（CACから換算）':''}`);
    put('extra-revenue',signed(man(result.revenue),2),result.revenue<0);
    put('extra-deals',result.additionalDeals===null?'基準となる問い合わせ数が算出できません':`年間の追加成約 ${signed(result.additionalDeals,1)}件`);
    put('extra-margin',signed(man(result.contribution),2),result.contribution<0);
    put('service-cost',fmt(man(result.serviceCost),0));
    put('service-cost-note','初年度は一括払い55万円、または月々払いの年間66万円（いずれも税込）。2年目以降は年間18万円（税込）。固定料金のため引用率によって料金は変わりません。');
    put('net-contribution',signed(man(result.netContribution),2),result.netContribution<0);
    put('cost-ratio',result.costRatio===null?'算出不可':`${fmt(result.costRatio,2)}倍`,result.costRatio<0);
    put('before-inquiries',result.baseAnnualInquiries===null?'算出不可':`${fmt(result.baseAnnualInquiries,1)}件`);
    put('after-inquiries',result.annualInquiries===null?'算出不可':`${fmt(result.annualInquiries,1)}件`);
    put('before-total-cost',result.annualExistingCost===null?'算出不可':`${fmt(man(result.annualExistingCost),1)}万円`);
    put('after-total-cost',result.annualInclusiveCost===null?'算出不可':`${fmt(man(result.annualInclusiveCost),1)}万円`);
    put('before-cpl',result.cpl===null?'算出不可':`${fmt(result.cpl,0)}円`);
    put('after-existing-cpl',result.existingCplAfter===null?'算出不可':`${fmt(result.existingCplAfter,0)}円`);
    put('after-inclusive-cpl',result.inclusiveCpl===null?'算出不可':`${fmt(result.inclusiveCpl,0)}円`);
    put('inclusive-improvement',result.inclusiveImprovement===null?'算出不可':`${fmt(Math.abs(result.inclusiveImprovement)*100,1)}% ${result.inclusiveImprovement>=0?'低下':'上昇'}`,result.inclusiveImprovement<0);
    put('baseline-cost-note',state.entryMode==='budget'?'現在の年間費用は、入力した月の広告費 × 12で計算しています。':`現在の${acquisition?'獲得コスト':'広告費'}は、月間問い合わせ数 × 換算後CPL × 12で逆算しています。`);
    const zeroNote=result.baseMonthlyInquiries===null?'広告費から計算するには、CPLを0円より大きくしてください。':result.cpl===null?'成約率0%ではCACからCPLを換算できないため、費用相当額と単価比較は算出しません。':result.baseMonthlyInquiries===0?'問い合わせ0件のため、導入後の1件単価とその改善率は算出しません。':result.cpl===0?'現在の単価が0円のため、単価の改善率は算出しません。':'';
    put('zero-note',zeroNote);
    renderFuture(scenarios(state));
    renderSimple(result);
    root.dataset.modelReady='true';
  }
  function syncField(name,value){
    root.querySelector(`[data-model-input="${name}"]`).value=value;
    root.querySelector(`[data-model-range="${name}"]`).value=value;
  }
  root.querySelectorAll('[data-model-input],[data-model-range]').forEach(input=>{
    input.addEventListener('input',()=>{
      const name=input.dataset.modelInput||input.dataset.modelRange;
      if(input.value.trim()==='')return;
      const value=Number(input.value);
      if(!Number.isFinite(value)||value<Number(input.min)||value>Number(input.max))return;
      state[name]=value;
      const otherSelector=input.dataset.modelInput?`[data-model-range="${name}"]`:`[data-model-input="${name}"]`;
      root.querySelector(otherSelector).value=value;
      render();
    });
    input.addEventListener('change',()=>{
      const name=input.dataset.modelInput||input.dataset.modelRange;
      const parsed=Number(input.value);
      const value=input.value.trim()===''||!Number.isFinite(parsed)?state[name]:Math.min(Number(input.max),Math.max(Number(input.min),parsed));
      state[name]=value;syncField(name,value);render();
    });
  });
  root.querySelectorAll('[data-model-citation]').forEach(button=>button.addEventListener('click',()=>{
    state.citation=Number(button.dataset.modelCitation);
    root.querySelectorAll('[data-model-citation]').forEach(el=>{const active=el===button;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    render();
  }));
  function updateCostLabel(){
    const label=root.querySelector('label[for="model-cost"]');
    label.textContent=state.entryMode!=='budget'&&state.costMode==='cac'?(state.costScope==='acquisition'?'顧客1件の獲得コスト':'広告費ベースの顧客獲得単価'):'問い合わせ1件の獲得単価';
    root.querySelector('[data-model-range="cost"]').setAttribute('aria-label',label.textContent+'を調整');
  }
  root.querySelector('[data-model-cost-mode]').addEventListener('change',event=>{
    const next=event.target.value;
    if(state.close>0){state.cost=next==='cac'?state.cost/(state.close/100):state.cost*(state.close/100);state.cost=Math.min(1000000,Math.round(state.cost));}
    state.costMode=next;syncField('cost',state.cost);updateCostLabel();render();
  });
  function updateEntryUI(){
    const budgetMode=state.entryMode==='budget';
    root.querySelectorAll('[data-model-entry]').forEach(button=>{const active=button.dataset.modelEntry===state.entryMode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    root.querySelectorAll('[data-model-direct-only]').forEach(el=>el.hidden=budgetMode);
    root.querySelectorAll('[data-model-budget-only]').forEach(el=>el.hidden=!budgetMode);
    updateCostLabel();
  }
  root.querySelectorAll('[data-model-entry]').forEach(button=>button.addEventListener('click',()=>{
    if(state.entryMode===button.dataset.modelEntry)return;
    state.entryMode=button.dataset.modelEntry;
    updateEntryUI();render();
  }));
  root.querySelector('[data-model-cost-scope]').addEventListener('change',event=>{state.costScope=event.target.value;updateCostLabel();render();});
  root.querySelector('[data-model-future-speed]').addEventListener('change',event=>{state.futureSpeed=Number(event.target.value);render();});
  function applySimpleInput(key,value){
    if(key==='inquiries'||key==='cost'){
      const previous=calculate(state);
      if(previous.baseMonthlyInquiries!==null)state.inquiries=previous.baseMonthlyInquiries;
      if(previous.cpl!==null)state.cost=previous.cpl;
      state.entryMode='direct';state.costMode='cpl';
      root.querySelector('[data-model-cost-mode]').value='cpl';
    }
    state[key]=value;
    ['inquiries','cost','close','order'].forEach(name=>syncField(name,state[name]));
    updateEntryUI();render();
  }
  root.querySelectorAll('[data-simple-input]').forEach(input=>{
    input.addEventListener('input',()=>{
      if(input.value.trim()==='')return;
      const value=Number(input.value);
      if(!Number.isFinite(value)||value<Number(input.min)||value>Number(input.max))return;
      applySimpleInput(input.dataset.simpleInput,value*Number(input.dataset.simpleScale));
    });
    input.addEventListener('change',()=>{
      if(input.value.trim()===''){render();return;}
      const value=Math.min(Number(input.max),Math.max(Number(input.min),Number(input.value)));
      if(Number.isFinite(value)){input.value=value;applySimpleInput(input.dataset.simpleInput,value*Number(input.dataset.simpleScale));}
    });
  });
  root.querySelectorAll('[data-simple-preset]').forEach(button=>button.addEventListener('click',()=>{
    const key=button.dataset.simplePreset,input=root.querySelector(`[data-simple-input="${key}"]`);
    input.value=button.dataset.simpleValue;
    applySimpleInput(key,Number(button.dataset.simpleValue)*Number(input.dataset.simpleScale));
  }));
  root.querySelector('[data-model-reset]').addEventListener('click',()=>{
    Object.assign(state,DEFAULTS);
    root.querySelector('[data-subscription-payment]').value=state.payment;
    root.querySelectorAll('[data-model-input]').forEach(input=>syncField(input.dataset.modelInput,state[input.dataset.modelInput]));
    root.querySelector('[data-model-cost-mode]').value=state.costMode;
    root.querySelector('[data-model-cost-scope]').value=state.costScope;
    root.querySelector('[data-model-future-speed]').value=String(state.futureSpeed);
    root.querySelectorAll('[data-model-citation]').forEach(el=>{const active=Number(el.dataset.modelCitation)===state.citation;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    updateEntryUI();render();
  });
  updateEntryUI();
  render();
})();
