/* Editable scene geometry, derived from the linked animation frames. */
(function () {
  'use strict';
  const A = '#ff9200', G = '#51eea2', B = '#55a9d7';
  const unitData = [
    { id: 'MELCHIOR', number: 1, aspect: '科学者', zh: '科学家' },
    { id: 'BALTHASAR', number: 2, aspect: '母', zh: '母亲' },
    { id: 'CASPER', number: 3, aspect: '女', zh: '女人' }
  ];
  const txt = (x,y,size,content,cls='tech',extra='') => `<text x="${x}" y="${y}" font-size="${size}" class="${cls}" ${extra}>${content}</text>`;
  const stamp = (id,x,y,w,h,color=G) => `<g id="${id}" class="stamp" fill="none" stroke="${color}"><rect x="${x}" y="${y}" width="${w}" height="${h}" stroke-width="2"/><rect x="${x+7}" y="${y+7}" width="${w-14}" height="${h-14}" stroke-width="1.4"/>${txt(x+w/2,y+h*.72,h*.61,'承 認','jp',`id="${id}-text" text-anchor="middle" fill="${color}" stroke="none" textLength="${w*.79}" lengthAdjust="spacingAndGlyphs"`)}</g>`;
  function tvScene() {
    const units = [
      {id:'BALTHASAR',n:2,path:'M426 20H774V388L690 445H510L426 388Z',box:[426,20,348,425],label:[600,266,292]},
      {id:'CASPER',n:3,path:'M28 425H318L510 550V710H28Z',box:[28,425,482,285],label:[249,601,330]},
      {id:'MELCHIOR',n:1,path:'M882 425H1172V710H690V550Z',box:[690,425,482,285],label:[939,601,358]}
    ];
    const cells = u => {
      const [x,y,w,h]=u.box, cols=Math.ceil(w/25),rows=Math.ceil(h/24);
      let s='';
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const rank=Math.min(.985,(col+((row*7)%11))/(cols+10));
        s+=`<rect class="infection-cell" data-unit="${u.id}" data-rank="${rank}" x="${x+col*25}" y="${y+row*24}" width="25.5" height="24.5" fill="#d90920" stroke="#881726" stroke-width=".8" opacity="0"/>`;
      }return s;
    };
    return `<svg id="tv-svg" viewBox="0 0 1200 740" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TV 版 MAGI 三贤人系统，三个切角单元与审议状态">
      <defs>${units.map(u=>`<clipPath id="tv-clip-${u.id}"><path d="${u.path}"/></clipPath>`).join('')}<linearGradient id="tv-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbffed" stop-opacity="0"/><stop offset="1" stop-color="#dbffed" stop-opacity=".45"/></linearGradient></defs>
      <rect width="1200" height="740" fill="#000"/>
      <path d="M462 408L411 506M738 408L789 506M510 615H690" fill="none" stroke="${A}" stroke-width="9"/>
      <g fill="none" stroke="#41c888" stroke-width="1.1"><path d="M17 69H414V73H17ZM17 79H414V83H17ZM17 180H414V184H17ZM17 190H414V194H17Z"/><path d="M786 69H1183V73H786ZM786 79H1183V83H786ZM786 180H1183V184H786ZM786 190H1183V194H786Z"/></g>
      <g fill="${A}">${txt(215,160,91,'提 訴','jp','id="tv-left-header" text-anchor="middle" textLength="240" lengthAdjust="spacing"')}${txt(986,160,91,'決 議','jp','id="tv-right-header" text-anchor="middle" textLength="240" lengthAdjust="spacing"')}
      ${txt(44,280,41,'CODE:127','tech','id="tv-code"')}${txt(45,310,21,'FILE:AKAGI_CHK','tech','id="tv-file"')}${txt(45,335,21,'EXTENTION:0256','tech number','id="tv-extension"')}${txt(45,360,21,'EX_MODE:ON','tech','id="tv-mode"')}${txt(45,385,21,'PRIORITY:A—','tech','id="tv-priority"')}</g>
      <g fill="${G}">${txt(996,264,21,'ALL GREEN','tech','id="tv-verdict-caption" text-anchor="middle"')}</g>
      ${stamp('tv-verdict',872,276,247,106,G)}
      ${units.map(u=>`<g class="unit" role="button" tabindex="0" aria-label="查看 ${u.id} 单元" data-unit="${u.id}"><path id="tv-${u.id}-surface" class="unit-shape" d="${u.path}" fill="${G}" stroke="${A}" stroke-width="2"/><g clip-path="url(#tv-clip-${u.id})">${cells(u)}<rect id="tv-${u.id}-beam" class="beam" x="${u.box[0]}" y="${u.box[1]}" width="${u.box[2]}" height="60" fill="url(#tv-beam)" opacity="0"/></g>${txt(u.label[0],u.label[1],49,`${u.id}･${u.n}`,'tech unit-label',`fill="#000000" text-anchor="middle" textLength="${u.label[2]}" lengthAdjust="spacingAndGlyphs"`)}</g>`).join('')}
      ${txt(600,562,64,'MAGI','serif',`fill="${A}" text-anchor="middle" textLength="165" lengthAdjust="spacingAndGlyphs"`)}
      ${txt(600,725,10,'SUPER COMPUTER SYSTEM · PERSONALITY TRANSPLANT OS','tech',`fill="#805f20" text-anchor="middle" letter-spacing="2"`)}
    </svg>`;
  }
  function terminalScene() {
    const nodes=[
      {id:'BALTHASAR',n:2,path:'M354 211H646V411L597 460H403L354 411Z',label:[500,280,268],stamp:[404,320,192,88]},
      {id:'CASPER',n:3,path:'M117 498H309L403 585V801H117Z',label:[262,766,250],stamp:[158,560,192,88]},
      {id:'MELCHIOR',n:1,path:'M691 498H883V801H597V585Z',label:[738,766,262],stamp:[649,560,192,88]}
    ];
    let amberDetails=txt(112,238,28,'CODE:258')+txt(112,269,25,'FILE:')+txt(112,298,25,'MAGI_SYS')+txt(112,327,25,'EXTENTION:')+txt(112,356,25,'4096')+txt(112,385,25,'EX_MODE:')+txt(112,414,25,'OFF')+txt(112,443,25,'PRIORITY:')+txt(112,472,25,'AAA');
    ['Layer 3:','Connection Control:','Q.931','Layer 2:','Data Link:','Q.921 - LAPD','Layer 1:','Physical Connection:','I.431 - Basic Interface'].forEach((s,i)=>{amberDetails+=txt(702,300+i*24,18,s,'tech',i===1||i===7?'textLength="176" lengthAdjust="spacingAndGlyphs"':'');});
    return `<svg id="terminal-svg" viewBox="0 0 1000 860" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="旧剧场版 MAGI 终端，显示三机各自的投票裁决">
      <defs><clipPath id="terminal-scan-clip"><rect x="100" y="202" width="800" height="612"/></clipPath></defs><rect width="1000" height="860" fill="#000"/>
      <g fill="none" stroke="${A}"><rect x="111" y="22" width="776" height="75" rx="4" stroke-width="2"/><path d="M118 63H880" stroke-width="1.1"/><path d="M111 115H119V186H111ZM128 115H136V186H128ZM862 115H870V186H862ZM879 115H887V186H879Z" stroke-width="2"/></g>
      <g fill="${A}">${txt(124,54,33,'DIRECT LINK CONNECTION : MAGI 01','tech','textLength="743" lengthAdjust="spacingAndGlyphs"')}${txt(124,87,36,'ACCESS MODE : SUPERUSER','tech','textLength="743" lengthAdjust="spacingAndGlyphs"')}${txt(151,140,33,'RESULT OF THE DELIBERATION','tech','textLength="686" lengthAdjust="spacingAndGlyphs"')}${txt(151,178,50,'MOTION:SELF-DESTRUCTION','tech','id="terminal-motion" textLength="686" lengthAdjust="spacingAndGlyphs"')}${amberDetails}</g>
      <path d="M403 460H597L648 530L597 585H403L352 530Z" fill="#000" stroke="${G}" stroke-width="5"/>
      ${txt(500,542,55,'MAGI','serif',`text-anchor="middle" fill="${G}"`)}
      ${nodes.map(n=>`<g class="unit" role="button" tabindex="0" data-unit="${n.id}" aria-label="查看 ${n.id} 裁决"><path d="${n.path}" class="unit-shape" id="terminal-${n.id}-surface" fill="#000" stroke="${G}" stroke-width="4.2"/>${txt(n.label[0],n.label[1],47,`${n.id}･${n.n}`,'tech unit-label',`fill="${G}" text-anchor="middle" textLength="${n.label[2]}" lengthAdjust="spacingAndGlyphs"`)}${stamp('terminal-'+n.id,...n.stamp,G)}</g>`).join('')}
      <g id="terminal-scan" clip-path="url(#terminal-scan-clip)" opacity="0" fill="none" stroke="${G}" stroke-width="1"><path d="M103 0H897"/><path d="M103 5H897" opacity=".35"/></g>
      ${txt(500,838,16,'SPECIAL MOTION · UNANIMOUS CONSENT REQUIRED','tech',`id="terminal-rule" text-anchor="middle" fill="${A}" letter-spacing="1"`)}
    </svg>`;
  }
  /* Keep the excerpt's actual art and timing. Only the initial reveal is reconstructed. */
  function defenceFilmScene() {
    const clip=window.MAGI_CLIPS.defence;
    const rings=Array.from({length:9},(_,i)=>`<circle class="reveal-ring" data-ring="${i}" cx="320" cy="179" r="${44+i*14.5}" fill="none" stroke="#fff" stroke-width="16" pathLength="1" stroke-dasharray="0 .5" stroke-dashoffset=".25"/>`).join('');
    return `<svg id="defence-svg" viewBox="0 0 640 358" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="666 防壁：启动阶段按层对向闭合，运行阶段按参考片段原有帧时长播放">
      <defs><mask id="film-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="358">
        <rect width="640" height="358" fill="#000"/>
        <path id="film-outer-reveal" d="M0 0H640V358H0ZM320 11a168 168 0 1 0 0 336a168 168 0 1 0 0-336Z" fill="#fff" fill-rule="evenodd" opacity="0"/>
        ${rings}
        <g fill="#fff"><rect x="0" y="0" width="213" height="59"/><rect x="433" y="0" width="207" height="60"/>
        <rect x="0" y="291" width="213" height="67"/><rect x="433" y="291" width="207" height="67"/>
        <path d="M230 58H296L349 150H460L427 215H330L278 302L229 274L281 184Z"/></g>
        <rect id="film-complete-reveal" width="640" height="358" fill="#fff" opacity="0"/>
      </mask></defs><rect width="640" height="358" fill="#000"/>
      <g id="film-art" mask="url(#film-reveal)">${clip.frames.map((src,i)=>`<image data-reference-frame="${i}" href="${src}" width="640" height="358" visibility="${i===0?'visible':'hidden'}"/>`).join('')}</g>
    </svg>`;
  }
  window.MAGI_SCENES={tv:tvScene,terminal:terminalScene,defence:defenceFilmScene,units:unitData};
})();
