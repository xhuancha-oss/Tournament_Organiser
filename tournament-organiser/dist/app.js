import {createTournament,startTournament,recordScore,winner,isLocked,completedCount,champion,ROUND_NAMES,loadState,saveState,exportText} from './tournament.js';
import {initParticipantManagement,useEnglishValidation} from './modules/participants.js';

const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={version:1,activeId:null,tournaments:[]};
let storageBlocked=false;
let participantEditor;

useEnglishValidation(document);

function ensureRosterSaved(){
  if(participantEditor?.isDirty()) throw new Error('Submit or cancel your participant changes first.');
}
function notify(text,error=false){$('#message').textContent=text;$('#message').className=error?'error':'';$('#message').hidden=false;}
try{state=loadState(localStorage);}catch(e){storageBlocked=true;notify('Saved data could not be read. Saving is paused to protect your records. Back up your browser data before continuing. '+e.message,true);}
function current(){return state.tournaments.find(t=>t.id===state.activeId);}
function commit(next){
  if(storageBlocked) throw new Error('Saved browser data could not be read. Saving is currently paused.');
  try{saveState(localStorage,next);}catch{throw new Error('Save failed. Browser storage is unavailable or full. Check your browser settings and try again. This change was not saved.');}
  state=next;
}
function update(t){commit({...state,tournaments:state.tournaments.map(old=>old.id===t.id?t:old)});}
function attempt(fn){try{fn();}catch(e){notify(e.message,true);}}
function stamp(){const el=$('#save-state');if(el){el.textContent='Saved in this browser · '+new Date().toLocaleTimeString('en-GB');el.classList.remove('error');}}

$('#create-form').addEventListener('submit',event=>{
  event.preventDefault();
  attempt(()=>{
    ensureRosterSaved();
    const t=createTournament($('#tournament-name').value);
    commit({...state,activeId:t.id,tournaments:[t,...state.tournaments]});
    $('#create-form').reset();render();notify('Tournament created. Add 8 participants.');participantEditor.focusName();
  });
});

function render(){
  const t=current();
  participantEditor=null;
  $('#saved-list').innerHTML=state.tournaments.length?`<label for="saved-select">Saved tournaments</label><select id="saved-select">${state.tournaments.map(item=>`<option value="${escape(item.id)}" ${item.id===state.activeId?'selected':''}>${escape(item.name)} · ${champion(item)?'Completed':item.rounds?'In progress':'Not started'}</option>`).join('')}</select>`:'';
  $('#saved-select')?.addEventListener('change',event=>attempt(()=>{
    const nextId=event.target.value;
    event.target.value=state.activeId;
    ensureRosterSaved();
    commit({...state,activeId:nextId});render();notify('Saved tournament opened.');
  }));
  if(!t){$('#workspace').innerHTML='<section class="empty">Create a tournament, then add 8 participants.</section>';return;}
  const won=champion(t);
  $('#workspace').innerHTML=`
    <section aria-labelledby="current-title">
      <div class="section-head"><h2 id="current-title" class="current-title">${escape(t.name)}</h2><span class="tag">${won?'Completed':t.rounds?'In progress':'Not started'} · 8-player single elimination</span></div>
      <div id="participant-manager"></div>
      ${t.rounds?'':drawControls()}
      <div class="actions"><button id="save-button" class="secondary" type="button">Save tournament</button><button id="export-button" class="secondary" type="button">Export results</button><span id="save-state" class="save-state">Saved in this browser</span></div>
    </section>
    ${won?`<section class="champion" aria-labelledby="champion-title"><h2 id="champion-title">Tournament complete · Champion</h2><strong>${escape(won)}</strong><p>All 7 matches are complete. The champion and scores have been saved automatically.</p></section>`:''}
    ${t.rounds?`<section aria-labelledby="bracket-title"><h2 id="bracket-title">3. Bracket and scores</h2><p class="progress">${completedCount(t)} / 7 matches completed · Submitting scores advances the winner and saves progress.</p><div class="bracket">${t.rounds.map((round,r)=>`<div class="round"><h3>${ROUND_NAMES[r]}</h3>${round.map((m,i)=>matchCard(t,m,r,i)).join('')}</div>`).join('')}</div><p class="hint">Scores must be whole numbers from 0 to 9999. Ties are not allowed. You can edit a result until a later match has a score.</p></section>${resultTable(t)}`:''}`;
  bind();
}

function drawControls(){
  return `<form id="draw-form" class="actions">
    <label for="draw-mode">First-round draw</label>
    <select id="draw-mode"><option value="ordered">Roster order (1 vs 2, 3 vs 4…)</option><option value="random">Random draw</option></select>
    <button type="submit">Generate bracket and lock roster</button>
    <button id="sample-button" class="secondary" type="button">Use sample participants</button>
  </form>`;
}

function matchCard(t,m,r,i){
  const ready=m.players.every(Boolean), locked=isLocked(t,r,i), win=winner(m);
  const matchId=`r${r}-m${i}`;
  return `<form class="match" data-round="${r}" data-index="${i}" aria-label="${ROUND_NAMES[r]} match ${i+1}"><header><b>Match ${i+1}</b><span class="state">${m.scores?'Completed':ready?'Ready for scores':'Awaiting participants'}</span></header>${m.players.map((p,k)=>`<div class="score-row"><label class="${p&&p===win?'winner-name':''}" for="${matchId}-s${k}">${escape(p||`Winner of previous-round match ${i*2+k+1}`)}</label><input id="${matchId}-s${k}" name="score-${k}" type="number" min="0" max="9999" step="1" inputmode="numeric" aria-label="${escape((p||'TBD participant')+' score')}" value="${m.scores?m.scores[k]:''}" ${!ready||locked?'disabled':''} required></div>`).join('')}${win?`<p class="winner">${r===2?'Champion':'Advances'}: ${escape(win)}</p>`:''}<button type="submit" ${!ready||locked?'disabled':''}>${locked?'Result locked':m.scores?'Update scores':r===2?'Save scores and confirm champion':'Save scores and advance winner'}</button>${locked?'<p>This result is locked because a later match already has a score.</p>':''}</form>`;
}

function resultTable(t){return `<section aria-labelledby="results-title"><h2 id="results-title">4. Results</h2><div class="results-wrap"><table><thead><tr><th scope="col">Round</th><th scope="col">Match</th><th scope="col">Score</th><th scope="col">Winner</th></tr></thead><tbody>${t.rounds.flatMap((round,r)=>round.map(m=>`<tr><td>${ROUND_NAMES[r]}</td><td>${escape(m.players[0]||'TBD')} vs ${escape(m.players[1]||'TBD')}</td><td>${m.scores?m.scores.join(' : '):'Pending'}</td><td>${escape(winner(m)||'TBD')}</td></tr>`)).join('')}</tbody></table></div></section>`;}

function bind(){
  participantEditor=initParticipantManagement($('#participant-manager'), {
    getTournament:current,
    onChange(next){
      update(next);
      $('#message').hidden=true;
      stamp();
    }
  });

  $('#draw-form')?.addEventListener('submit',event=>{
    event.preventDefault();
    attempt(()=>{
      ensureRosterSaved();
      const latest=current();
      if(latest.players.some(name=>!name.trim())) throw new Error('Add all 8 participants before generating the bracket.');
      update(startTournament(latest,latest.players,$('#draw-mode').value==='random'));
      render();notify('Bracket generated. Enter scores for the first round.');
      $('#bracket-title').scrollIntoView({block:'start',behavior:'smooth'});
    });
  });
  $('#sample-button')?.addEventListener('click',()=>attempt(()=>{
    ensureRosterSaved();
    const latest=current();
    if(latest.players.some(name=>name.trim()) && !window.confirm('Replace the current roster with 8 sample participants?')) return;
    const mode=$('#draw-mode').value;
    const players=Array.from({length:8},(_,index)=>`Player ${index+1}`);
    update({...latest,players,participantEmails:{},updatedAt:new Date().toISOString()});
    render();$('#draw-mode').value=mode;notify('Added 8 sample participants. You can now generate the bracket.');
  }));
  $('#save-button').addEventListener('click',()=>attempt(()=>{ensureRosterSaved();commit(state);stamp();notify('Tournament and progress saved in this browser.');}));
  $('#export-button').addEventListener('click',()=>attempt(()=>{
    ensureRosterSaved();
    const latest=current();
    const url=URL.createObjectURL(new Blob(['\ufeff'+exportText(latest)],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=latest.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_')+'-results.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Results file exported.');
  }));
  document.querySelectorAll('form.match').forEach(form=>form.addEventListener('submit',event=>{
    event.preventDefault();attempt(()=>{
      const r=Number(form.dataset.round), i=Number(form.dataset.index);
      const updated=recordScore(current(),r,i,form.elements['score-0'].value,form.elements['score-1'].value);
      update(updated);render();notify(champion(updated)?`Tournament complete! Champion: ${champion(updated)}. Results saved.`:'Scores saved. The winner advances to the next round.');
    });
  }));
}

window.addEventListener('storage',event=>{
  if(event.key!=='tournament-organiser-v1')return;
  try{state=loadState(localStorage);storageBlocked=false;render();notify('Tournament data synced with another tab.');}catch{storageBlocked=true;notify('Data from another tab could not be read. Saving is paused.',true);}
});
render();
