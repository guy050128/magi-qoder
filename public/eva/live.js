/* Live presentation only. Every vote and final arbitration comes from the parent Server Actions. */
(function () {
  'use strict';
  const $=id=>document.getElementById(id), F=window.MAGI_FLOW;
  const colors={...F.COLORS,abstain:'#3caee0',deadlock:'#ff8d00'};
  const votes={APPROVE:'approve',REJECT:'reject',ABSTAIN:'abstain'};
  const voteLabels={APPROVE:'承 認',REJECT:'否 決',ABSTAIN:'棄 権',DEADLOCK:'膠 着'};
  const captions={APPROVE:'APPROVED',REJECT:'REJECTED',ABSTAIN:'ABSTAINED',DEADLOCK:'DEADLOCK'};
  let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  try{const pref=localStorage.getItem('magi-motion');if(pref)reduced=pref==='reduced';}catch{}
  $('motion-mode').value=reduced?'reduced':'full';
  let attack=false,tl=F.timeline(false),time=tl.phase('ready').start,playing=false,lastFrame=null;
  let connected=false,started=false,requestId=null,results={},trace=null,reviewElapsed=0;
  let reviewFrom=null,currentState=null,question='',failureMessage='',infectionShown=false;
  let handshake=null;
  const post=data=>{if(parent!==window)parent.postMessage(data,location.origin);};
  const height=()=>post({type:'magi:height',height:Math.ceil(document.body.getBoundingClientRect().height)});
  const announce=()=>{post({type:'magi:ready'});height();};
  window.addEventListener('error',()=>post({type:'magi:failure'}));
  $('scene-tv').innerHTML=MAGI_SCENES.tv();
  $('scene-terminal').innerHTML=MAGI_SCENES.terminal();
  $('scene-defence').innerHTML=MAGI_SCENES.defence();
  const surfaces=Object.fromEntries(F.IDS.map(id=>[id,$(`tv-${id}-surface`)]));
  const cells=[...document.querySelectorAll('.infection-cell')];
  const rings=[...document.querySelectorAll('.reveal-ring')];
  const frameEls=[...document.querySelectorAll('[data-reference-frame]')];
  const titles={boot:'SYSTEM INITIALIZATION','boot-link':'DEFENCE SCREEN ACCESS',closure:'SCREEN ESTABLISHMENT',defence:'PROTECT NO.666','ready-link':'CONSOLE CONNECTION',ready:'AWAITING PROPOSAL','review-link':'PROPOSAL ACCEPTED',review:'DELIBERATION IN PROGRESS','terminal-link':'UNIT VOTE RECORD',terminal:'DIRECT LINK CONNECTION : MAGI 01','complete-link':'FINAL DECISION LINK',complete:'RESULT OF THE DELIBERATION',intrusion:'INVASION & COUNTERMEASURE',return:'RESTORING DISPLAY'};
  const codes={boot:'SYSTEM BOOT','boot-link':'SCREEN CONNECTING',closure:'SCREEN RAISING',defence:'SCREEN ACTIVE','ready-link':'CONSOLE CONNECTING',ready:'AWAITING INPUT','review-link':'PROPOSAL ACCEPTED',review:'DELIBERATING','terminal-link':'RESULT CONNECTING',terminal:'VOTE COMPLETE','complete-link':'DECISION CONNECTING',complete:'DECISION RECORDED',intrusion:'COUNTERMEASURE',return:'RESTORING DISPLAY'};
  function phases(){
    $('chapters').innerHTML=tl.phases.filter(p=>p.id!=='defence'&&!p.transition).map((p,i)=>`<button type="button" disabled data-phase="${p.id}"><small>${String(i+1).padStart(2,'0')}</small>${p.label}</button>`).join('');
  }
  function phaseAt(t){
    const base=tl.phases.find(p=>t<p.end)||tl.phases.at(-1);
    const local=t-base.start,p=F.clamp(local/(base.end-base.start));
    const transition=base.transition?{...base.transition,progress:p}:null;
    return {phase:transition?{...base,scene:p<.5?transition.from:transition.to}:base,local,progress:p,transition};
  }
  function hash(text){let h=2166136261;for(const ch of text){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function state(){
    const s=phaseAt(time),{phase,local,progress}=s;
    const reviewing=phase.id==='review'||phase.id==='review-link'&&progress>=.5;
    const all=F.IDS.every(id=>results[id]);
    const final=!!trace&&(phase.id==='complete'||phase.id==='complete-link'&&progress>=.5);
    const returning=phase.id==='return',invading=phase.id==='intrusion'||returning&&progress<.5;
    const seed=hash(question||'MAGI');
    const units=F.IDS.map((id,i)=>{
      let status=results[id]?votes[results[id].vote]:failureMessage?'pending':'approve',black=false;
      if(reviewing){
        if(!results[id]){
          status='pending';const delay=((seed>>>(i*7))%181)/1000;
          black=!reduced&&phase.id==='review'&&reviewElapsed>=delay&&((reviewElapsed-delay)%.25)>=.125;
        }
        if(phase.id==='review-link'&&progress<.5+i*.13)black=!reduced;
      }else if(phase.id==='review-link')status=reviewFrom?.units[i]||'approve';
      if(invading){status=phase.id==='return'||local>=5.7?'approve':'pending';black=false;}
      return {id,status,black};
    });
    const pending=reviewing&&!all,recording=all&&!final&&phase.id!=='ready';
    const badge=failureMessage?'接続断':invading?'侵 入':final?voteLabels[trace.verdict]:pending?'審議中':recording?'完 了':'待 機';
    return {...s,units,all,pending,recording,final,invading,badge,
      badgeBlack:!reduced&&pending&&phase.id==='review'&&(reviewElapsed%.5)>=.25,
      terminalTime:phase.id==='terminal-link'?0:phase.id==='complete-link'?2.4:local,
      frame:phase.id==='ready-link'?MAGI_CLIPS.defence.frameCount-1:phase.id==='defence'?F.clipFrame(MAGI_CLIPS.defence,local):0,
      ringProgress:Array.from({length:9},(_,i)=>phase.id==='boot-link'?0:phase.id==='closure'?F.clamp((local-i*.11)/1.32):1),
      code:127+seed%800,extension:String(256+seed%8000).padStart(4,'0')};
  }
  function drawTV(s){
    for(const unit of s.units)surfaces[unit.id].setAttribute('fill',unit.black?colors.black:colors[unit.status]);
    $('tv-left-header').textContent=s.invading?'侵 入':'提 訴';
    $('tv-right-header').textContent=s.invading?'対 抗':'決 議';
    let color=failureMessage?'#e55942':s.invading?'#f62920':s.pending||s.recording?'#f7ca62':s.final?colors[votes[trace.verdict]||'deadlock']:colors.approve;
    let badge=s.badge,caption=failureMessage?'CONNECTION LOST':s.invading?'COUNTERATTACK':s.pending?'DELIBERATING':s.recording?'VOTES RECORDED':s.final?captions[trace.verdict]:'SYSTEM READY';
    if(s.phase.id==='review-link'&&s.progress<.5&&reviewFrom){color=reviewFrom.color;badge=reviewFrom.badge;caption=reviewFrom.caption;}
    $('tv-verdict').setAttribute('stroke',color);$('tv-verdict-text').setAttribute('fill',color);
    $('tv-verdict-text').textContent=badge;$('tv-verdict').setAttribute('opacity',s.badgeBlack?'0':'1');
    $('tv-verdict-caption').textContent=caption;$('tv-verdict-caption').setAttribute('fill',color);
    $('tv-code').textContent=`CODE:${s.code}`;$('tv-extension').textContent=`EXTENTION:${s.extension}`;
    $('tv-file').textContent=s.invading?'FILE:COUNTER_SYS':'FILE:MAGI_SYS';
    $('tv-mode').textContent=s.invading?'EX_MODE:ON':'EX_MODE:OFF';
    $('tv-priority').textContent=trace?.rule==='unanimous-critical'?'PRIORITY:AAA':'PRIORITY:A—';
    if(s.phase.id==='intrusion'){
      const sweep=s.local<4.1?F.clamp((s.local-.9)/2.7):F.clamp(1-(s.local-4.1)/2.2);
      for(const cell of cells)cell.setAttribute('opacity',Number(cell.dataset.rank)<sweep?'.94':'0');infectionShown=true;
    }else if(infectionShown){for(const cell of cells)cell.setAttribute('opacity','0');infectionShown=false;}
  }
  function drawDefence(s){
    frameEls.forEach((el,i)=>el.setAttribute('visibility',i===s.frame?'visible':'hidden'));
    $('film-complete-reveal').setAttribute('opacity',s.phase.id==='defence'||s.ringProgress.every(p=>p>=1)?'1':'0');
    rings.forEach((ring,i)=>{const p=s.ringProgress[i];ring.setAttribute('stroke-dasharray',`${p*.5} ${(1-p)*.5}`);ring.setAttribute('stroke-dashoffset','.25');});
    $('film-outer-reveal').setAttribute('opacity','1');
  }
  function drawTerminal(s){
    const shortened=question.length>36?question.slice(0,36)+'…':question;
    $('terminal-motion').textContent=`MOTION: ${shortened}`;
    $('terminal-rule').textContent=trace?.rule==='unanimous-critical'?'SPECIAL MOTION · UNANIMOUS CONSENT REQUIRED':'ORDINARY MOTION · MAJORITY CONSENT REQUIRED';
    for(const [i,id] of F.IDS.entries()){
      const result=results[id],status=result?votes[result.vote]:'pending',color=colors[status];
      $(`terminal-${id}`).setAttribute('stroke',color);$(`terminal-${id}-text`).setAttribute('fill',color);
      $(`terminal-${id}-text`).textContent=result?voteLabels[result.vote]:'待 機';
      $(`terminal-${id}`).setAttribute('opacity',result&&s.terminalTime>=.18+i*.28?'1':'0');
      $(`terminal-${id}-surface`).setAttribute('stroke',color);
    }
  }
  function transition(s){
    for(const name of ['tv','defence','terminal','boot'])$(`scene-${name}`).style.clipPath='none';
    const tr=s.transition;$('signal-transition').hidden=!tr||reduced;if(!tr||reduced)return;
    const p=tr.progress;
    $('signal-curtain').style.opacity=p<.16?'0':p<.3?'.55':p<.5?'1':'0';
    $('signal-card').style.opacity=p>=.3&&p<.53?'1':'0';
    $('signal-card-title').textContent=tr.card;$('signal-card-sub').textContent=tr.sub;
    $('signal-register').hidden=true;
    if(p>=.5&&s.phase.id!=='review-link'){
      const open=p<.61?.12:p<.73?.38:p<.85?.7:1,center=s.phase.id==='boot-link',inset=center?(1-open)*50:0;
      $(`scene-${tr.to}`).style.clipPath=`inset(${inset}% 0 ${(1-open)*100-inset}% 0)`;
      $('signal-register').hidden=open>=1;$('signal-register').style.top=`${center?50+open*50:open*100}%`;
    }
  }
  function finalExplanation(){
    if(!trace)return '';
    const counts=`${trace.approveCount} 票承认、${trace.rejectCount} 票否决、${trace.abstainCount} 票弃权。`;
    if(trace.rule==='unanimous-critical')return counts+'重大议题要求全体承认。';
    if(trace.rule==='abstain-majority')return counts+'两台以上弃权，系统保留判断。';
    if(trace.rule==='deadlock')return counts+'意见未形成多数，请人工裁决。';
    return counts+'按多数决汇总。点击分机可查看推理说明。';
  }
  function render(){
    const s=state();currentState=s;
    for(const name of ['tv','defence','terminal','boot'])$(`scene-${name}`).hidden=name!==s.phase.scene;
    $('theatre').dataset.scene=s.phase.scene;
    if(s.phase.scene==='tv')drawTV(s);if(s.phase.scene==='defence')drawDefence(s);if(s.phase.scene==='terminal')drawTerminal(s);
    let scale=1;const restoring=s.phase.id==='return'&&!reduced;
    if(restoring){const p=s.progress;scale=p<.5?1-.988*Math.pow(p*2,3):.012+.988*(1-Math.pow(2-p*2,3));}
    $('scene-tv').style.transform=`scaleY(${scale})`;$('return-line').hidden=!restoring;
    $('return-line').style.opacity=String(1-scale);$('return-line').style.transform=`scaleX(${.6+.4*(1-scale)})`;
    transition(s);
    $('screen-title').textContent='MAGI-01 / '+titles[s.phase.id];
    $('status-code').textContent=!connected?'CONNECTING':failureMessage?'CONNECTION ERROR':codes[s.phase.id];
    $('status-code').classList.toggle('alert',!!failureMessage||s.invading||s.final&&trace.verdict!=='APPROVE');
    $('screen-mode').textContent=trace?.rule==='unanimous-critical'?'PRIORITY AAA / UNANIMOUS':'PRIORITY A / MAJORITY';
    $('phase-label').textContent=s.phase.label;
    const received=Object.keys(results).length;
    $('screen-summary').textContent=failureMessage?`RECEIVED: ${received} / 3`:s.final?captions[trace.verdict]:s.recording?'UNIT VOTES RECORDED':s.phase.id==='review'?`RECEIVED: ${received} / 3`:'PERSONALITY TRANSPLANT OS';
    const available=connected&&started&&(s.phase.id==='ready'||s.phase.id==='complete');
    $('submit-proposal').disabled=!available;$('question').readOnly=!available;
    $('restart').disabled=!(available&&!requestId);
    $('phase-note').textContent=failureMessage||(!connected?'正在接入三贤人系统…':s.phase.id==='ready'?'系统已就绪。输入提案，开始三机审议。':s.phase.id==='review'?`已收到 ${received} / 3 份分机判断；各机返回后独立停止闪烁。`:s.phase.id==='terminal'?'分机判断已记录，正在汇总裁决。':s.phase.id==='complete'?'裁决已记录，可点击分机查看判断理由。':s.invading?'緊急対処 / COUNTERMEASURE':s.phase.id==='return'?'恢复主控台…':'系统画面接入中…');
    $('form-message').textContent=s.phase.id==='review'?'三台主机正在独立审议。':s.phase.id==='complete'?'可继续输入下一项提案。':'输入是非题形式的提案；重大议题按全票制裁决。';
    $('verdict-strip').hidden=s.phase.id!=='complete'||!trace;
    $('verdict-strip').classList.toggle('rejected',trace?.verdict==='REJECT');
    $('verdict-strip').classList.toggle('abstained',trace?.verdict==='ABSTAIN');
    $('verdict-strip').classList.toggle('deadlocked',trace?.verdict==='DEADLOCK');
    $('final-label').textContent=trace?`${voteLabels[trace.verdict]} / ${captions[trace.verdict]}`:'';
    $('final-explanation').textContent=finalExplanation();
    $('chapters').querySelectorAll('button').forEach(b=>{
      const active=b.dataset.phase===(s.transition?.chapter||(s.phase.id==='defence'?'closure':s.phase.id));
      if(active)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');
      b.classList.toggle('passed',tl.phase(b.dataset.phase).end<=time);
    });
  }
  function toDefault(){
    attack=false;tl=F.timeline(false);time=tl.phase('ready').start;playing=false;lastFrame=null;
    requestId=null;results={};trace=null;reviewFrom=null;reviewElapsed=0;phases();render();height();
  }
  function submit(){
    if(!connected||!started||!['ready','complete'].includes(currentState.phase.id))return;
    const value=$('question').value.trim();if(!value){$('question').reportValidity();return;}
    question=value;failureMessage='';reviewFrom={units:currentState.units.map(u=>u.status),badge:$('tv-verdict-text').textContent,color:$('tv-verdict-text').getAttribute('fill'),caption:$('tv-verdict-caption').textContent};
    results={};trace=null;reviewElapsed=0;
    attack=F.easterEgg(value);tl=F.timeline(attack);phases();
    if(attack){post({type:'magi:clear'});if(reduced){toDefault();return;}time=tl.phase('intrusion').start;}
    else{
      requestId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
      time=tl.phase(reduced?'review':'review-link').start;
      post({type:'magi:proposal',requestId,topic:question});
    }
    playing=true;lastFrame=null;render();height();
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||!event.data||typeof event.data!=='object')return;
    const data=event.data;
    if(data.type==='magi:ping'){announce();return;}
    if(data.type==='magi:start'){
      connected=true;started=true;clearInterval(handshake);failureMessage='';$('bridge-error').hidden=true;
      if(typeof data.reduced==='boolean')reduced=data.reduced;
      $('motion-mode').value=reduced?'reduced':'full';
      attack=false;tl=F.timeline(false);results={};trace=null;requestId=null;reviewElapsed=0;
      time=tl.phase(reduced?'ready':'boot-link').start;playing=!reduced;lastFrame=null;phases();render();height();return;
    }
    if(data.type==='magi:resume'){
      if(typeof data.requestId!=='string'||typeof data.topic!=='string')return;
      connected=true;started=true;clearInterval(handshake);failureMessage='';$('bridge-error').hidden=true;
      attack=false;tl=F.timeline(false);requestId=data.requestId;question=data.topic.slice(0,500);$('question').value=question;
      results={};trace=null;reviewFrom=null;reviewElapsed=0;
      for(const id of F.IDS){const r=data.results?.[id];if(r&&r.id===id&&Object.hasOwn(votes,r.vote))results[id]=r;}
      if(data.completed){
        if(data.trace&&Object.hasOwn(voteLabels,data.trace.verdict)&&F.IDS.every(id=>results[id])){
          trace=data.trace;time=tl.phase('complete').start;
        }else{
          time=tl.phase('ready').start;failureMessage='连接中断，已保留已返回的分机判断。可稍后重试。';
        }
        requestId=null;playing=false;
      }else{time=tl.phase('review').start;playing=true;}
      lastFrame=null;phases();render();height();return;
    }
    if(data.requestId!==requestId||!requestId)return;
    if(data.type==='magi:accepted')return;
    if(data.type==='magi:result'){
      const r=data.result;
      if(r&&F.IDS.includes(r.id)&&Object.hasOwn(votes,r.vote))results[r.id]=r;
    }else if(data.type==='magi:complete'){
      if(F.IDS.every(id=>results[id])&&data.trace&&Object.hasOwn(voteLabels,data.trace.verdict))trace=data.trace;
    }else if(data.type==='magi:error'){
      // Keep real partial votes visible when a transport fails. Never turn a missing answer into a vote.
      attack=false;tl=F.timeline(false);time=tl.phase('ready').start;playing=false;lastFrame=null;
      requestId=null;trace=null;reviewFrom=null;
      failureMessage='连接中断，已保留已返回的分机判断。可稍后重试。';
      phases();render();height();return;
    }
    if(trace&&reduced){time=tl.phase('complete').start;playing=false;requestId=null;}
    render();height();
  });
  $('proposal-form').addEventListener('submit',e=>{e.preventDefault();submit();});
  $('question').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();submit();}});
  $('restart').addEventListener('click',()=>{if(requestId)return;started=false;playing=false;post({type:'magi:restart'});render();});
  $('help').addEventListener('click',()=>post({type:'magi:help'}));
  $('classic').addEventListener('click',()=>post({type:'magi:classic'}));
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.screen-shell').requestFullscreen();}catch{failureMessage='当前窗口无法全屏显示。';render();}});
  $('motion-mode').addEventListener('change',()=>{
    reduced=$('motion-mode').value==='reduced';try{localStorage.setItem('magi-motion',reduced?'reduced':'full');}catch{}
    if(reduced){
      if(attack){toDefault();return;}
      if(currentState.phase.id==='review-link')time=tl.phase('review').start;
      else if(currentState.phase.id==='review'&&!trace){}
      else if(trace){time=tl.phase('complete').start;playing=false;requestId=null;}
      else{time=tl.phase('ready').start;playing=false;}
    }
    lastFrame=null;render();height();
  });
  document.querySelectorAll('.unit').forEach(unit=>{
    const show=()=>post({type:'magi:unit',unitId:unit.dataset.unit});
    unit.addEventListener('click',show);unit.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}});
  });
  document.addEventListener('visibilitychange',()=>{lastFrame=null;});
  function tick(now){
    if(playing&&!document.hidden){
      if(lastFrame!==null){
        const dt=Math.min((now-lastFrame)/1000,.12),p=phaseAt(time).phase;
        if(p.id==='review'){
          reviewElapsed+=dt;
          if(trace&&(reduced||reviewElapsed>=5.4))time=tl.phase('terminal-link').start;
          else time=Math.min(time+dt,tl.phase('review').end-.00001);
        }else{
          const next=Math.min(time+dt,tl.duration),ready=tl.phase('ready').start;
          if(time<ready&&next>=ready){time=ready;playing=false;}
          else{time=next;if(time>=tl.duration){if(attack){toDefault();return requestAnimationFrame(tick);}playing=false;requestId=null;}}
        }
        render();
      }
      lastFrame=now;
    }else lastFrame=null;
    requestAnimationFrame(tick);
  }
  new ResizeObserver(height).observe(document.body);
  for(const src of MAGI_CLIPS.defence.frames){const image=new Image();image.src=src;}
  phases();render();announce();handshake=setInterval(()=>{if(!started)announce();},1000);
  setTimeout(()=>{if(!connected){$('bridge-error').hidden=false;height();}},15000);
  requestAnimationFrame(tick);
})();
