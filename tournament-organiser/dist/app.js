import {createTournament,startTournament,recordScore,winner,isLocked,completedCount,champion,ROUND_NAMES,loadState,saveState,exportText} from './tournament.js';

const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={version:1,activeId:null,tournaments:[]};
let storageBlocked=false;
function notify(text,error=false){$('#message').textContent=text;$('#message').className=error?'error':'';$('#message').hidden=false;}
try{state=loadState(localStorage);}catch(e){storageBlocked=true;notify('无法读取已保存的数据，已停止写入以保护原记录。请导出或备份浏览器数据后再处理。'+e.message,true);}
function current(){return state.tournaments.find(t=>t.id===state.activeId);}
function commit(next){
  if(storageBlocked) throw new Error('当前浏览器数据无法读取，暂不能保存新比赛。');
  try{saveState(localStorage,next);}catch{throw new Error('保存失败：浏览器存储不可用或空间不足。请检查浏览器设置后重试，本次操作未保存。');}
  state=next;
}
function update(t){commit({...state,tournaments:state.tournaments.map(old=>old.id===t.id?t:old)});}
function attempt(fn){try{fn();}catch(e){notify(e.message,true);}}
function stamp(){const el=$('#save-state');if(el){el.textContent='已保存到当前浏览器 · '+new Date().toLocaleTimeString('zh-CN');el.classList.remove('error');}}

$('#create-form').addEventListener('submit',event=>{
  event.preventDefault();
  attempt(()=>{
    const t=createTournament($('#tournament-name').value);
    commit({...state,activeId:t.id,tournaments:[t,...state.tournaments]});
    $('#create-form').reset();render();notify('比赛已创建，请填写 8 名选手。');$('#player-0').focus();
  });
});

function render(){
  const t=current();
  $('#saved-list').innerHTML=state.tournaments.length?`<label for="saved-select">已保存的比赛</label><select id="saved-select">${state.tournaments.map(item=>`<option value="${escape(item.id)}" ${item.id===state.activeId?'selected':''}>${escape(item.name)} · ${champion(item)?'已结束':item.rounds?'进行中':'待开始'}</option>`).join('')}</select>`:'';
  $('#saved-select')?.addEventListener('change',event=>attempt(()=>{commit({...state,activeId:event.target.value});render();notify('已打开保存的比赛。');}));
  if(!t){$('#workspace').innerHTML='<section class="empty">先创建一场比赛，再添加 8 名参赛者。</section>';return;}
  const won=champion(t);
  $('#workspace').innerHTML=`
    <section aria-labelledby="current-title">
      <div class="section-head"><h2 id="current-title" class="current-title">${escape(t.name)}</h2><span class="tag">${won?'已结束':t.rounds?'进行中':'待开始'} · 8 人单淘汰</span></div>
      ${!t.rounds?playerForm(t):`<ol class="participant-list">${t.players.map(p=>`<li>${escape(p)}</li>`).join('')}</ol><p class="hint">选手已锁定。比赛开始后不再增删选手或重新抽签。</p>`}
      <div class="actions"><button id="save-button" class="secondary" type="button">保存比赛</button><button id="export-button" class="secondary" type="button">导出比赛结果</button><span id="save-state" class="save-state">已保存到当前浏览器</span></div>
    </section>
    ${won?`<section class="champion" aria-labelledby="champion-title"><h2 id="champion-title">比赛结束 · 冠军</h2><strong>${escape(won)}</strong><p>全部 7 场比赛已完成，冠军和比分已自动保存。</p></section>`:''}
    ${t.rounds?`<section aria-labelledby="bracket-title"><h2 id="bracket-title">3. 对阵与比分</h2><p class="progress">已完成 ${completedCount(t)} / 7 场 · 提交比分后自动晋级并保存</p><div class="bracket">${t.rounds.map((round,r)=>`<div class="round"><h3>${ROUND_NAMES[r]}</h3>${round.map((m,i)=>matchCard(t,m,r,i)).join('')}</div>`).join('')}</div><p class="hint">比分只接受 0–9999 的整数，不能平局。后续比赛尚未录入比分时，可以修改本场结果。</p></section>${resultTable(t)}`:''}`;
  bind(t);
}

function playerForm(t){return `<h3>2. 添加 8 名参赛者</h3><form id="players-form"><div class="players">${t.players.map((p,i)=>`<div class="player-field"><label for="player-${i}">选手 ${i+1}</label><input id="player-${i}" name="player-${i}" value="${escape(p)}" maxlength="40" required autocomplete="off" placeholder="输入姓名"></div>`).join('')}</div><div class="actions"><label for="draw-mode">首轮对阵</label><select id="draw-mode"><option value="ordered">按名单顺序（1 对 2、3 对 4…）</option><option value="random">随机抽签</option></select><button type="submit">生成对阵并锁定选手</button><button id="sample-button" class="secondary" type="button">填入示例选手</button></div><p class="hint">需要 8 个不同的姓名；同名选手请加编号。填写后会自动保存。</p></form>`;}

function matchCard(t,m,r,i){
  const ready=m.players.every(Boolean), locked=isLocked(t,r,i), win=winner(m);
  const matchId=`r${r}-m${i}`;
  return `<form class="match" data-round="${r}" data-index="${i}" aria-label="${ROUND_NAMES[r]}第${i+1}场"><header><b>第 ${i+1} 场</b><span class="state">${m.scores?'已完成':ready?'待录入':'等待晋级'}</span></header>${m.players.map((p,k)=>`<div class="score-row"><label class="${p&&p===win?'winner-name':''}" for="${matchId}-s${k}">${escape(p||`等待上一轮第 ${i*2+k+1} 场胜者`)}</label><input id="${matchId}-s${k}" name="score-${k}" type="number" min="0" max="9999" step="1" inputmode="numeric" aria-label="${escape((p||'待定选手')+'比分')}" value="${m.scores?m.scores[k]:''}" ${!ready||locked?'disabled':''} required></div>`).join('')}${win?`<p class="winner">${r===2?'冠军':'晋级'}：${escape(win)}</p>`:''}<button type="submit" ${!ready||locked?'disabled':''}>${locked?'结果已锁定':m.scores?'更新比分':r===2?'保存比分并确定冠军':'保存比分并晋级'}</button>${locked?'<p>后续比赛已有成绩，不能修改本场。</p>':''}</form>`;
}

function resultTable(t){return `<section aria-labelledby="results-title"><h2 id="results-title">4. 比赛结果</h2><div class="results-wrap"><table><thead><tr><th scope="col">轮次</th><th scope="col">对阵</th><th scope="col">比分</th><th scope="col">胜者</th></tr></thead><tbody>${t.rounds.flatMap((round,r)=>round.map(m=>`<tr><td>${ROUND_NAMES[r]}</td><td>${escape(m.players[0]||'待定')} vs ${escape(m.players[1]||'待定')}</td><td>${m.scores?m.scores.join(' : '):'未完成'}</td><td>${escape(winner(m)||'待定')}</td></tr>`)).join('')}</tbody></table></div></section>`;}

function bind(t){
  const form=$('#players-form');
  function saveDraft(){
    const latest=current();
    const players=Array.from({length:8},(_,i)=>$(`#player-${i}`).value);
    update({...latest,players,updatedAt:new Date().toISOString()});stamp();
  }
  form?.addEventListener('input',()=>attempt(saveDraft));
  form?.addEventListener('submit',event=>{
    event.preventDefault();attempt(()=>{
      const players=Array.from({length:8},(_,i)=>$(`#player-${i}`).value);
      update(startTournament(current(),players,$('#draw-mode').value==='random'));render();notify('对阵表已生成，可以录入首轮比分。');$('#bracket-title').scrollIntoView({block:'start',behavior:'smooth'});
    });
  });
  $('#sample-button')?.addEventListener('click',()=>attempt(()=>{for(let i=0;i<8;i++)$(`#player-${i}`).value=`选手${i+1}`;saveDraft();notify('已填入 8 名示例选手，可以直接生成对阵表。');}));
  $('#save-button').addEventListener('click',()=>attempt(()=>{if(form)saveDraft();else{commit(state);stamp();}notify('比赛及当前进度已保存到此浏览器。');}));
  $('#export-button').addEventListener('click',()=>attempt(()=>{
    if(form)saveDraft();
    const latest=current();
    const url=URL.createObjectURL(new Blob(['\ufeff'+exportText(latest)],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=latest.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_')+'-比赛结果.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('已导出比赛结果文件。');
  }));
  document.querySelectorAll('form.match').forEach(form=>form.addEventListener('submit',event=>{
    event.preventDefault();attempt(()=>{
      const r=Number(form.dataset.round), i=Number(form.dataset.index);
      const updated=recordScore(current(),r,i,form.elements['score-0'].value,form.elements['score-1'].value);
      update(updated);render();notify(champion(updated)?`比赛已结束！冠军：${champion(updated)}。结果已保存。`:'比分已保存，胜者已进入下一轮。');
    });
  }));
}

window.addEventListener('storage',event=>{
  if(event.key!=='tournament-organiser-v1')return;
  try{state=loadState(localStorage);storageBlocked=false;render();notify('比赛数据已与另一个标签页同步。');}catch{storageBlocked=true;notify('另一个标签页的数据无法读取，已暂停保存。',true);}
});
render();
