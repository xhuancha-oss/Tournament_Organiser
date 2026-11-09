import {createTournament,startTournament,recordScore,winner,isLocked,completedCount,champion,ROUND_NAMES,loadState,saveState,exportText} from './tournament.js?v=20261109-en2';

const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={version:1,activeId:null,tournaments:[]};
let storageBlocked=false;
let requestedTournamentMissing=false;
function notify(text,error=false){$('#message').textContent=text;$('#message').className=error?'error':'';$('#message').hidden=false;}
try{state=loadState(localStorage);}catch(e){storageBlocked=true;notify('Saved data could not be read. Saving is paused to protect existing records. Back up your browser data before making changes. '+e.message,true);}
const requestedTournamentId=new URLSearchParams(location.search).get('tournament');
if(requestedTournamentId!==null&&!storageBlocked){
  if(state.tournaments.some(t=>t.id===requestedTournamentId))state.activeId=requestedTournamentId;
  else{requestedTournamentMissing=true;notify('The requested tournament was not found. Return to the tournament list and choose another one.',true);}
}
function current(){return state.tournaments.find(t=>t.id===state.activeId);}
function commit(next){
  if(storageBlocked) throw new Error('Browser data could not be read. New tournaments cannot be saved yet.');
  try{saveState(localStorage,next);}catch{throw new Error('Save failed: browser storage is unavailable or full. Check your browser settings and try again. This change has not been saved.');}
  state=next;
}
function update(t){commit({...state,tournaments:state.tournaments.map(old=>old.id===t.id?t:old)});}
function attempt(fn){try{fn();}catch(e){notify(e.message,true);}}
function stamp(){const el=$('#save-state');if(el){el.textContent='Saved in this browser · '+new Date().toLocaleTimeString('en-GB');el.classList.remove('error');}}

// Keep validation feedback in English even when the browser uses another language.
document.addEventListener('invalid',event=>{
  const field=event.target;
  if(!(field instanceof HTMLInputElement))return;
  const validity=field.validity;
  const message=validity.valueMissing?'Please fill in this field.':
    validity.badInput?'Please enter a number.':
    validity.rangeUnderflow?`The score must be at least ${field.min}.`:
    validity.rangeOverflow?`The score must not exceed ${field.max}.`:
    validity.stepMismatch?'Please enter a whole number.':'Please check this value.';
  field.setCustomValidity(message);
},true);
document.addEventListener('input',event=>{
  if(event.target instanceof HTMLInputElement)event.target.setCustomValidity('');
});

$('#create-form').addEventListener('submit',event=>{
  event.preventDefault();
  attempt(()=>{
    const t=createTournament($('#tournament-name').value);
    commit({...state,activeId:t.id,tournaments:[t,...state.tournaments]});
    requestedTournamentMissing=false;
    const url=new URL(location.href);url.searchParams.set('tournament',t.id);history.replaceState(null,'',url);
    $('#create-form').reset();render();notify('Tournament created. Enter eight players to continue.');$('#player-0').focus();
  });
});

function render(){
  const t=current();
  $('#saved-list').innerHTML=state.tournaments.length?`<label for="saved-select">Saved tournaments</label><select id="saved-select">${state.tournaments.map(item=>`<option value="${escape(item.id)}" ${item.id===state.activeId?'selected':''}>${escape(item.name)} · ${champion(item)?'Completed':item.rounds?'In progress':'Not started'}</option>`).join('')}</select>`:'';
  $('#saved-select')?.addEventListener('change',event=>attempt(()=>{commit({...state,activeId:event.target.value});requestedTournamentMissing=false;const url=new URL(location.href);url.searchParams.set('tournament',state.activeId);history.replaceState(null,'',url);render();notify('Saved tournament opened.');}));
  if(requestedTournamentMissing){$('#workspace').innerHTML='<section class="empty"><h2>Tournament not found</h2><p>Return to the list to select another tournament, or create one above.</p><a href="./TournamentList.html">Back to tournament list</a></section>';return;}
  if(!t){$('#workspace').innerHTML='<section class="empty">Create a tournament, then add eight players.</section>';return;}
  const won=champion(t);
  $('#workspace').innerHTML=`
    <section aria-labelledby="current-title">
      <div class="section-head"><h2 id="current-title" class="current-title">${escape(t.name)}</h2><span class="tag">${won?'Completed':t.rounds?'In progress':'Not started'} · 8-player single elimination</span></div>
      ${!t.rounds?playerForm(t):`<ol class="participant-list">${t.players.map(p=>`<li>${escape(p)}</li>`).join('')}</ol><p class="hint">The player list is locked. Players and the draw cannot be changed after the bracket is generated.</p>`}
      <div class="actions"><button id="save-button" class="secondary" type="button">Save tournament</button><button id="export-button" class="secondary" type="button">Export results</button><span id="save-state" class="save-state">Saved in this browser</span></div>
    </section>
    ${won?`<section class="champion" aria-labelledby="champion-title"><h2 id="champion-title">Tournament complete · Champion</h2><strong>${escape(won)}</strong><p>All seven matches are complete. The champion and scores have been saved automatically.</p></section>`:''}
    ${t.rounds?`<section aria-labelledby="bracket-title"><h2 id="bracket-title">3. Bracket and scores</h2><p class="progress">${completedCount(t)} of 7 matches completed · Saving a score advances the winner automatically</p><div class="bracket">${t.rounds.map((round,r)=>`<div class="round"><h3>${ROUND_NAMES[r]}</h3>${round.map((m,i)=>matchCard(t,m,r,i)).join('')}</div>`).join('')}</div><p class="hint">Scores must be whole numbers from 0 to 9999, with no ties. A result can be edited until a later match has a recorded score.</p></section>${resultTable(t)}`:''}`;
  bind(t);
}

function playerForm(t){return `<h3>2. Add eight players</h3><form id="players-form"><div class="players">${t.players.map((p,i)=>`<div class="player-field"><label for="player-${i}">Player ${i+1}</label><input id="player-${i}" name="player-${i}" value="${escape(p)}" maxlength="40" required autocomplete="off" placeholder="Enter player name"></div>`).join('')}</div><div class="actions"><label for="draw-mode">First-round draw</label><select id="draw-mode"><option value="ordered">List order (1 vs 2, 3 vs 4...)</option><option value="random">Random draw</option></select><button type="submit">Generate bracket and lock players</button><button id="sample-button" class="secondary" type="button">Use example players</button></div><p class="hint">Enter eight distinct names. Add a number to distinguish players with the same name. Changes are saved automatically.</p></form>`;}

function matchCard(t,m,r,i){
  const ready=m.players.every(Boolean), locked=isLocked(t,r,i), win=winner(m);
  const matchId=`r${r}-m${i}`;
  return `<form class="match" data-round="${r}" data-index="${i}" aria-label="${ROUND_NAMES[r]}, match ${i+1}"><header><b>Match ${i+1}</b><span class="state">${m.scores?'Completed':ready?'Awaiting score':'Awaiting players'}</span></header>${m.players.map((p,k)=>`<div class="score-row"><label class="${p&&p===win?'winner-name':''}" for="${matchId}-s${k}">${escape(p||`Winner of previous round, match ${i*2+k+1}`)}</label><input id="${matchId}-s${k}" name="score-${k}" type="number" min="0" max="9999" step="1" inputmode="numeric" aria-label="${escape((p||'Player to be decided')+' score')}" value="${m.scores?m.scores[k]:''}" ${!ready||locked?'disabled':''} required></div>`).join('')}${win?`<p class="winner">${r===2?'Champion':'Advancing player'}: ${escape(win)}</p>`:''}<button type="submit" ${!ready||locked?'disabled':''}>${locked?'Result locked':m.scores?'Update score':r===2?'Save score and confirm champion':'Save score and advance winner'}</button>${locked?'<p>A later match has a recorded score, so this result is locked.</p>':''}</form>`;
}

function resultTable(t){return `<section aria-labelledby="results-title"><h2 id="results-title">4. Match results</h2><div class="results-wrap"><table><thead><tr><th scope="col">Round</th><th scope="col">Match</th><th scope="col">Score</th><th scope="col">Winner</th></tr></thead><tbody>${t.rounds.flatMap((round,r)=>round.map(m=>`<tr><td>${ROUND_NAMES[r]}</td><td>${escape(m.players[0]||'TBD')} vs ${escape(m.players[1]||'TBD')}</td><td>${m.scores?m.scores.join(' : '):'Not completed'}</td><td>${escape(winner(m)||'TBD')}</td></tr>`)).join('')}</tbody></table></div></section>`;}

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
      update(startTournament(current(),players,$('#draw-mode').value==='random'));render();notify('Bracket generated. Enter the quarter-final scores to begin.');$('#bracket-title').scrollIntoView({block:'start',behavior:'smooth'});
    });
  });
  $('#sample-button')?.addEventListener('click',()=>attempt(()=>{for(let i=0;i<8;i++)$(`#player-${i}`).value=`Player ${i+1}`;saveDraft();notify('Eight example players added. You can now generate the bracket.');}));
  $('#save-button').addEventListener('click',()=>attempt(()=>{if(form)saveDraft();else{commit(state);stamp();}notify('The tournament and current progress have been saved in this browser.');}));
  $('#export-button').addEventListener('click',()=>attempt(()=>{
    if(form)saveDraft();
    const latest=current();
    const url=URL.createObjectURL(new Blob(['\ufeff'+exportText(latest)],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=latest.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_')+'-Results.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Tournament results exported.');
  }));
  document.querySelectorAll('form.match').forEach(form=>form.addEventListener('submit',event=>{
    event.preventDefault();attempt(()=>{
      const r=Number(form.dataset.round), i=Number(form.dataset.index);
      const updated=recordScore(current(),r,i,form.elements['score-0'].value,form.elements['score-1'].value);
      update(updated);render();notify(champion(updated)?`Tournament complete! Champion: ${champion(updated)}. Results saved.`:'Score saved. The winner has advanced to the next round.');
    });
  }));
}

window.addEventListener('storage',event=>{
  if(event.key!=='tournament-organiser-v1'&&event.key!==null)return;
  try{
    const pageId=new URLSearchParams(location.search).get('tournament')??state.activeId;
    state=loadState(localStorage);
    requestedTournamentMissing=pageId!==null&&!state.tournaments.some(t=>t.id===pageId);
    if(pageId!==null&&!requestedTournamentMissing)state.activeId=pageId;
    storageBlocked=false;render();
    notify(requestedTournamentMissing?'The requested tournament was not found. Return to the tournament list and choose another one.':'Tournament data has been updated from another tab.',requestedTournamentMissing);
  }catch{storageBlocked=true;notify('Data from another tab could not be read. Saving is paused.',true);}
});
render();
