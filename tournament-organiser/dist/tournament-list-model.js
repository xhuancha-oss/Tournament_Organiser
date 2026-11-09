import {champion,completedCount} from './tournament.js';

export const STATUS_LABELS = Object.freeze({pending:'待开始','in-progress':'进行中',completed:'已结束'});
export const SORT_ORDERS = ['updated-desc','created-desc','name-asc'];
const nameCollator = new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});

export function normaliseSearch(text='') {
  return String(text).normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
}

export function tournamentStatus(tournament) {
  if(champion(tournament))return 'completed';
  return tournament.rounds ? 'in-progress' : 'pending';
}

export function tournamentSummary(tournament) {
  const status=tournamentStatus(tournament);
  return {
    id:tournament.id,name:tournament.name,status,statusLabel:STATUS_LABELS[status],
    participantCount:tournament.players.filter(p=>p.trim()).length,
    capacity:tournament.players.length,completedMatches:completedCount(tournament),
    totalMatches:tournament.rounds?tournament.rounds.flat().length:tournament.players.length-1,
    champion:champion(tournament),createdAt:tournament.createdAt,updatedAt:tournament.updatedAt
  };
}

export function statusCounts(tournaments) {
  const counts={all:tournaments.length,pending:0,'in-progress':0,completed:0};
  for(const t of tournaments)counts[tournamentStatus(t)]++;
  return counts;
}

export function queryTournaments(tournaments,{search='',status='all',sort='updated-desc'}={}) {
  const q=normaliseSearch(search);
  const rows=tournaments.map(tournamentSummary).filter(t=>(!q||normaliseSearch(t.name).includes(q))&&(status==='all'||t.status===status));
  return rows.sort((a,b)=>{
    const comparison=sort==='name-asc'?nameCollator.compare(a.name,b.name):Date.parse(b[sort==='created-desc'?'createdAt':'updatedAt'])-Date.parse(a[sort==='created-desc'?'createdAt':'updatedAt']);
    return comparison||nameCollator.compare(a.name,b.name)||a.id.localeCompare(b.id);
  });
}

export function tournamentDetailsHref(id) {
  return `./index.html?tournament=${encodeURIComponent(id)}#current-title`;
}
