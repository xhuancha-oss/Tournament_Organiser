export const ROUND_NAMES = ['Quarter-finals', 'Semi-finals', 'Final'];
export const STORAGE_KEY = 'tournament-organiser-v1';

export function cleanName(value, max = 40) {
  if (typeof value !== 'string') throw new Error('Enter a valid name.');
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Name is required.');
  if (name.length > max) throw new Error(`Name must be ${max} characters or fewer.`);
  return name;
}

export function createTournament(name, id = crypto.randomUUID()) {
  return {id, name:cleanName(name,80), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), players:Array(8).fill(''), rounds:null};
}

export function validatePlayers(players) {
  if (!Array.isArray(players) || players.length !== 8) throw new Error('Exactly 8 participants are required.');
  const names = players.map(p=>cleanName(p));
  if (new Set(names.map(p=>p.toLocaleLowerCase())).size !== 8) throw new Error('Participant names must be unique. Add a number to distinguish participants with the same name.');
  return names;
}

export function startTournament(tournament, players, random = false, rng = Math.random) {
  if (tournament.rounds) throw new Error('The bracket has already been generated. The draw is locked.');
  const names = validatePlayers(players);
  if (random) for(let i=names.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[names[i],names[j]]=[names[j],names[i]];}
  const next = structuredClone(tournament);
  next.players = names;
  next.rounds = [Array.from({length:4},(_,i)=>({players:[names[i*2],names[i*2+1]],scores:null})),Array.from({length:2},()=>({players:[null,null],scores:null})),[{players:[null,null],scores:null}]];
  next.updatedAt = new Date().toISOString();
  return next;
}

export function winner(match) {
  return match.scores ? match.players[match.scores[0] > match.scores[1] ? 0 : 1] : null;
}

export function isLocked(tournament, round, index) {
  for(let r=round+1,i=Math.floor(index/2);r<3;r++,i=Math.floor(i/2)){
    if(tournament.rounds[r][i].scores) return true;
  }
  return false;
}

export function recordScore(tournament, round, index, rawA, rawB) {
  const match = tournament.rounds?.[round]?.[index];
  if (!match) throw new Error('Match not found.');
  if (!match.players.every(Boolean)) throw new Error('Complete the corresponding matches in the previous round first.');
  if (isLocked(tournament,round,index)) throw new Error('This result is locked because a later match already has a score.');
  const scores = [rawA,rawB].map(v=>{
    const s=String(v).trim();
    if (!/^\d+$/.test(s)) throw new Error('Enter a non-negative whole-number score for each participant.');
    const n=Number(s);
    if (!Number.isSafeInteger(n) || n>9999) throw new Error('Scores must be between 0 and 9999.');
    return n;
  });
  if(scores[0]===scores[1]) throw new Error('A match must have a winner. Enter the final scores after the tie-break.');
  const next=structuredClone(tournament);
  next.rounds[round][index].scores=scores;
  if(round<2) next.rounds[round+1][Math.floor(index/2)].players[index%2]=winner(next.rounds[round][index]);
  next.updatedAt=new Date().toISOString();
  return next;
}

export function completedCount(t) { return t.rounds ? t.rounds.flat().filter(m=>m.scores).length : 0; }
export function champion(t) {return t.rounds ? winner(t.rounds[2][0]) : null;}

// Replay scores to validate the bracket before accepting stored browser data.
export function validateTournament(t) {
  if(!t || typeof t.id!=='string' || !t.id || typeof t.name!=='string' || !Array.isArray(t.players) || t.players.length!==8 || !t.players.every(p=>typeof p==='string' && p.length<=40)) throw new Error('The saved tournament data is invalid.');
  cleanName(t.name,80);
  if(!Number.isFinite(Date.parse(t.createdAt)) || !Number.isFinite(Date.parse(t.updatedAt))) throw new Error('The saved dates are invalid.');
  if(t.rounds===null) return t;
  if(!Array.isArray(t.rounds) || t.rounds.length!==3 || !t.rounds.every((r,i)=>Array.isArray(r)&&r.length===[4,2,1][i])) throw new Error('The saved bracket is incomplete.');
  let replay=startTournament({...t,rounds:null},t.players);
  t.rounds.forEach((round,r)=>round.forEach((match,i)=>{
    if(!match || JSON.stringify(match.players)!==JSON.stringify(replay.rounds[r][i].players)) throw new Error('The saved bracket contains inconsistent advancement data.');
    if(match.scores!==null){
      if(!Array.isArray(match.scores)||match.scores.length!==2||!match.scores.every(Number.isInteger)) throw new Error('The saved scores are invalid.');
      replay=recordScore(replay,r,i,...match.scores);
    }
  }));
  return t;
}

export function loadState(storage) {
  const raw=storage.getItem(STORAGE_KEY);
  if(!raw) return {version:1,activeId:null,tournaments:[]};
  const s=JSON.parse(raw);
  if(s.version!==1||!Array.isArray(s.tournaments)) throw new Error('The saved data version or format is invalid.');
  s.tournaments.forEach(validateTournament);
  if(new Set(s.tournaments.map(t=>t.id)).size!==s.tournaments.length) throw new Error('The saved data contains duplicate tournament IDs.');
  if(!s.tournaments.some(t=>t.id===s.activeId)) s.activeId=s.tournaments[0]?.id ?? null;
  return s;
}

export function saveState(storage,state){storage.setItem(STORAGE_KEY,JSON.stringify(state));}

export function exportText(t) {
  const lines=[`Tournament: ${t.name}`,'Format: 8-player single elimination',`Exported: ${new Date().toLocaleString('en-GB')}`,'',`Champion: ${champion(t)||'Not yet decided'}`,'Participants: '+t.players.join(', '),''];
  t.rounds?.forEach((round,r)=>{
    lines.push(ROUND_NAMES[r]);
    round.forEach((m,i)=>lines.push(`${i+1}. ${m.players[0]||'TBD'} vs ${m.players[1]||'TBD'} | ${m.scores?m.scores.join(' : '):'Pending'} | Winner: ${winner(m)||'TBD'}`));
    lines.push('');
  });
  return lines.join('\r\n');
}
