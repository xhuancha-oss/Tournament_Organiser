import {loadState,STORAGE_KEY} from './tournament.js?v=20261109-en2';
import {queryTournaments,statusCounts,STATUS_LABELS,SORT_ORDERS,tournamentDetailsHref} from './tournament-list-model.js?v=20261109-en2';

const $=selector=>document.querySelector(selector);
const dateFormat=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
let tournaments=[];
let loaded=false;

// Module 1 data boundary: replace this reader with Fetch when the shared Flask API is ready.
function readTournaments(){return loadState(localStorage).tournaments;}

function readFiltersFromUrl(){
  const params=new URLSearchParams(location.search);
  $('#search-name').value=(params.get('q')||'').slice(0,80);
  const status=params.get('status');
  $('#filter-status').value=Object.hasOwn(STATUS_LABELS,status)?status:'all';
  $('#sort-order').value=SORT_ORDERS.includes(params.get('sort'))?params.get('sort'):'updated-desc';
}

function filters(){return {search:$('#search-name').value,status:$('#filter-status').value,sort:$('#sort-order').value};}

function updateUrl(){
  const f=filters(),url=new URL(location.href);
  url.searchParams.delete('q');url.searchParams.delete('status');url.searchParams.delete('sort');
  if(f.search.trim())url.searchParams.set('q',f.search.trim());
  if(f.status!=='all')url.searchParams.set('status',f.status);
  if(f.sort!=='updated-desc')url.searchParams.set('sort',f.sort);
  history.replaceState(null,'',url);
}

function cell(text){const td=document.createElement('td');if(text!==undefined)td.textContent=text;return td;}

function makeRow(t){
  const tr=document.createElement('tr');
  const name=cell(),link=document.createElement('a');
  link.className='name-link';link.href=tournamentDetailsHref(t.id);link.textContent=t.name;name.append(link);
  const extra=document.createElement('p');extra.className='secondary-line';extra.textContent=t.champion?`Champion: ${t.champion}`:'8-player single elimination';name.append(extra);
  const status=cell(),badge=document.createElement('span');badge.className=`status-badge status-${t.status}`;badge.textContent=t.statusLabel;status.append(badge);
  const people=cell(`${t.participantCount} / ${t.capacity}`);
  people.setAttribute('aria-label',`${t.participantCount} of ${t.capacity} players registered`);
  const progress=cell(`${t.completedMatches} / ${t.totalMatches}`);
  progress.setAttribute('aria-label',`${t.completedMatches} of ${t.totalMatches} matches completed`);
  const bar=document.createElement('div'),fill=document.createElement('span');bar.className='progress-bar';bar.setAttribute('aria-hidden','true');fill.style.width=`${100*t.completedMatches/t.totalMatches}%`;bar.append(fill);progress.append(bar);
  const updated=cell(),time=document.createElement('time');time.dateTime=t.updatedAt;time.textContent=dateFormat.format(new Date(t.updatedAt));updated.append(time);
  const action=cell(),open=document.createElement('a');open.className='row-action';open.href=tournamentDetailsHref(t.id);open.textContent=t.status==='completed'?'View results':t.status==='pending'?'Manage players':'Continue tournament';open.setAttribute('aria-label',`${open.textContent}: ${t.name}`);action.append(open);
  tr.append(name,status,people,progress,updated,action);return tr;
}

function renderRows(){
  if(!loaded)return;
  const rows=queryTournaments(tournaments,filters());
  const body=$('#tournament-rows');body.replaceChildren(...rows.map(makeRow));
  $('#table-wrap').hidden=!rows.length;
  $('#empty-state').hidden=!!rows.length;
  $('#result-summary').textContent=`Showing ${rows.length} of ${tournaments.length} tournaments.`;
  const empty=!tournaments.length;
  $('#empty-title').textContent=empty?'No tournaments yet':'No matching tournaments';
  $('#empty-description').textContent=empty?'Create a tournament and add players to get started.':'Try a different tournament name or status, or clear the filters to show all tournaments.';
  $('#empty-create').hidden=!empty;
  $('#empty-reset').hidden=empty;
}

function refresh(){
  $('#list-section').setAttribute('aria-busy','true');
  try{
    tournaments=readTournaments();loaded=true;
    const counts=statusCounts(tournaments);
    for(const [id,value] of Object.entries(counts))$(`#count-${id}`).textContent=value;
    $('#load-error').hidden=true;renderRows();
  }catch(error){
    loaded=false;tournaments=[];
    for(const id of ['all','pending','in-progress','completed'])$(`#count-${id}`).textContent='—';
    $('#table-wrap').hidden=true;$('#empty-state').hidden=true;
    $('#tournament-rows').replaceChildren();
    $('#result-summary').textContent='Unable to load tournaments.';
    $('#load-error-message').textContent=`${error.message} Your saved records have not been changed. Check browser storage settings. If the data is damaged, back it up before contacting the maintainer.`;
    $('#load-error').hidden=false;
  }finally{$('#list-section').setAttribute('aria-busy','false');}
}

function applyFilters(){updateUrl();renderRows();}
function clearFilters(){
  $('#filter-form').reset();applyFilters();$('#search-name').focus();
}
$('#filter-form').addEventListener('submit',event=>{event.preventDefault();applyFilters();});
$('#search-name').addEventListener('input',applyFilters);
$('#filter-status').addEventListener('change',applyFilters);
$('#sort-order').addEventListener('change',applyFilters);
$('#clear-filters').addEventListener('click',clearFilters);
$('#empty-reset').addEventListener('click',clearFilters);
$('#refresh-list').addEventListener('click',refresh);
$('#retry-list').addEventListener('click',refresh);
window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY||event.key===null)refresh();});
window.addEventListener('pageshow',()=>{readFiltersFromUrl();refresh();});
window.addEventListener('popstate',()=>{readFiltersFromUrl();refresh();});
readFiltersFromUrl();refresh();
