/* One time source drives every visible state, including the existing site's blink. */
(function () {
  'use strict';
  const clamp = (v, lo=0, hi=1) => Math.min(hi, Math.max(lo, v));
  const IDS = ['MELCHIOR', 'BALTHASAR', 'CASPER'];
  const COLORS = {approve:'#52e691',reject:'#a41413',pending:'#3caee0',amber:'#ff8d00',black:'#000000'};
  function timeline(attack=false) {
    let cursor=0;
    const result=[];
    const add=(id,label,length,scene,note,transition=null)=>{result.push({id,label,start:cursor,end:cursor+length,scene,note,transition});cursor+=length;};
    add('boot','系统启动',7.4,'boot','使用原网站的进入动画：三机依次上线、24 格进度、同步完成后淡出。');
    add('boot-link','接入防壁',.48,'defence','短黑场、琥珀信号字卡、分层接入防壁；跨场景衔接为风格重建。',{from:'boot',to:'defence',card:'PROTECT NO.666',sub:'防壁 接続',chapter:'closure'});
    add('closure','防壁建立',2.4,'defence','双向圆弧按层闭合；完整启动镜头未核实，此段为参考重建。');
    add('defence','防壁运行',2.2,'defence','按新片段的 22 帧、每帧 100 毫秒播放一次；不另加整环旋转。');
    add('ready-link','主控台接入',.48,'tv','防壁画面短暂断开，主控台按显示行分段接入。',{from:'defence',to:'tv',card:'MAGI-01 ONLINE',sub:'主制御 復帰',chapter:'ready'});
    add('ready','等待提案',.8,'tv','系统停在这里，输入提案后开始审议。');
    if(attack) {
      add('intrusion','使徒入侵',6.3,'tv','特殊彩蛋：只播放入侵画面的方块侵蚀与恢复。');
      add('return','恢复主控台',.8,'tv','屏幕收束后恢复，返回默认的等待提案画面。');
      return {phases:result,duration:cursor,phase:id=>result.find(p=>p.id===id)};
    }
    add('review-link','受理提案',.42,'tv','提案受理字卡后，蓝色单元与审议章分段接入，再进入现站原有闪烁。',{from:'tv',to:'tv',card:'DELIBERATION',sub:'審 議 開 始',chapter:'review'});
    add('review','三机审议',5.4,'tv','保留现站闪烁：单元 0.25 秒、审议章 0.5 秒；各机返回后独立停闪。');
    add('terminal-link','分机结果接入',.48,'terminal','先记录三机投票，经信号字卡与分段接入显示分机结果。',{from:'tv',to:'terminal',card:'UNIT VOTE RECORD',sub:'分機 結果',chapter:'terminal'});
    add('terminal','分机裁决',2.4,'terminal','先显示分机裁决，再汇总最终结果。');
    add('complete-link','最终裁决发布',.48,'tv','汇总分机结果，经同样的信号过渡发布最终裁决。',{from:'terminal',to:'tv',card:'FINAL DECISION',sub:'最終 裁決',chapter:'complete'});
    add('complete','最终裁决',1.4,'tv','普通提案多数决；重大提案全体一致。可继续输入另一项提案。');
    return {phases:result,duration:cursor,phase:id=>result.find(p=>p.id===id)};
  }
  function hash(text) {let n=2166136261;for(const c of text){n^=c.codePointAt(0);n=Math.imul(n,16777619);}return n>>>0;}
  function clipFrame(clip, seconds, repeat=false) {
    const t=repeat?Math.max(0,seconds)%clip.duration:clamp(seconds,0,clip.duration-.000001);
    let index=0;
    for(let i=1;i<clip.frameTimes.length&&clip.frameTimes[i]<=t+.0000001;i++) index=i;
    return index;
  }
  const easterEgg=question=>/使徒来袭|CODE\s*[:：]\s*666|THE\s+BEAST/i.test(question);
  window.MAGI_FLOW={timeline,clipFrame,easterEgg,IDS,COLORS,clamp};
})();
