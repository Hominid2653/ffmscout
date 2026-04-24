// ─────────────────────────────────────────────
//  FPL ANALYTICS — script.js
// ─────────────────────────────────────────────

// ── CONFIG ───────────────────────────────────
const PROXY    = 'https://corsproxy.io/?';
const FPL_BASE = 'https://fantasy.premierleague.com/api';
// Proxied to avoid CORS — corsproxy.io forwards all headers including anthropic-version
const ANTHROPIC_API = () => PROXY + encodeURIComponent('https://api.anthropic.com/v1/messages');

const SHIRT_URL = (code, isGK = false) =>
  `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${code}${isGK ? '_1' : ''}-66.png`;

// ── STATE ─────────────────────────────────────
const state = {
  players:     [],
  teams:       [],
  fixtures:    [],
  loaded:      false,
  teamCodeMap: {},  // team.id → team.code
  aiHistory:   [],  // {role, content}[]
};

// ── HELPERS ──────────────────────────────────

async function fetchFPL(path) {
  const r = await fetch(PROXY + encodeURIComponent(FPL_BASE + path));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const teamById      = id  => state.teams.find(t => t.id === id) || null;
const teamShortName = id  => teamById(id)?.short_name ?? '?';
const getTeamCode   = id  => state.teamCodeMap[id] ?? id;
const posLabel      = type => ({ 1:'GKP', 2:'DEF', 3:'MID', 4:'FWD' })[type] ?? '?';

function shirtImg(teamId, isGK = false, size = 44) {
  const src = SHIRT_URL(getTeamCode(teamId), isGK);
  return `<img src="${src}" width="${size}" height="${size}"
    style="object-fit:contain;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.15))"
    alt="" onerror="this.style.visibility='hidden'" />`;
}

function spinnerHTML(msg = 'Loading…') {
  return `<div class="flex items-center gap-3 py-10 text-sm text-gray-400">
    <svg class="spinner w-4 h-4 text-fpl-green" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
    </svg>${msg}</div>`;
}

function errorHTML(msg) {
  return `<div class="rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3">⚠ ${msg}</div>`;
}

// ── INIT ─────────────────────────────────────

async function init() {
  try {
    const data = await fetchFPL('/bootstrap-static/');
    state.players = data.elements;
    state.teams   = data.teams;
    state.teams.forEach(t => { state.teamCodeMap[t.id] = t.code; });
    state.loaded  = true;
    renderTop();
    initSearch();
    initAI();
  } catch (e) {
    document.getElementById('top-content').innerHTML =
      errorHTML(`Could not load FPL data — API may be unavailable. ${e.message}`);
  }
}

async function initFixtures() {
  try {
    const data = await fetchFPL('/fixtures/?future=1');
    state.fixtures = data.slice(0, 50);
    renderFixtures();
  } catch (e) {
    document.getElementById('fixtures-content').innerHTML =
      errorHTML(`Could not load fixtures. ${e.message}`);
  }
}

// ── TOP PLAYERS ───────────────────────────────

function renderTop() {
  const top = [...state.players].sort((a,b) => b.total_points - a.total_points).slice(0,15);
  document.getElementById('top-content').innerHTML =
    `<div class="flex flex-col gap-2">${top.map((p,i) => playerRow(p,i,'top')).join('')}</div>`;
}

function playerRow(p, i, mode) {
  const pos  = posLabel(p.element_type);
  const isGK = p.element_type === 1;
  const layoutClass = mode === 'value' ? 'value-layout' : 'top-layout';

  const valueExtra = mode === 'value'
    ? `<span class="val-score">${p.valueScore}✦</span>
       <span class="price">£${(p.now_cost/10).toFixed(1)}m</span>`
    : '';

  return `
    <div class="player-card ${layoutClass}">
      <span class="rank ${i < 3 ? 'gold' : ''}">${i >= 0 ? i+1 : '—'}</span>
      ${shirtImg(p.team, isGK, 40)}
      <div>
        <div class="player-name-el">${p.web_name}</div>
        <div class="player-meta">${teamShortName(p.team)}</div>
      </div>
      ${valueExtra}
      <span class="pos-badge ${pos}">${pos}</span>
      <span class="pts">${p.total_points}</span>
    </div>`;
}

// ── SEARCH ───────────────────────────────────

function initSearch() {
  document.getElementById('search-input').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const countEl = document.getElementById('search-count');
    const listEl  = document.getElementById('search-results');
    if (!q) { countEl.textContent = ''; listEl.innerHTML = ''; return; }
    const matches = state.players
      .filter(p => `${p.first_name} ${p.second_name} ${p.web_name}`.toLowerCase().includes(q))
      .slice(0, 20);
    countEl.textContent = `${matches.length} player${matches.length !== 1 ? 's' : ''} found`;
    listEl.innerHTML = `<div class="flex flex-col gap-2">
      ${matches.map(p => playerRow(p, -1, 'top')).join('')}
    </div>`;
  });
}

// ── FIXTURES ─────────────────────────────────

function renderFixtures() {
  if (!state.fixtures.length) {
    document.getElementById('fixtures-content').innerHTML = errorHTML('No upcoming fixtures found.');
    return;
  }
  document.getElementById('fixtures-content').innerHTML =
    `<div class="flex flex-col gap-2">
      ${state.fixtures.map(f => {
        const hTeam = teamById(f.team_h);
        const aTeam = teamById(f.team_a);
        const hd = f.team_h_difficulty || 3;
        const ad = f.team_a_difficulty || 3;
        const date = f.kickoff_time
          ? new Date(f.kickoff_time).toLocaleDateString('en-GB',{day:'numeric',month:'short'})
          : 'TBC';
        return `
          <div class="bg-white border border-gray-100 rounded-xl px-4 py-2.5 grid items-center gap-3"
               style="grid-template-columns:2.5rem 1fr auto 1fr 2.5rem">
            ${hTeam ? shirtImg(hTeam.id, false, 32) : '<div class="w-8 h-8"></div>'}
            <div class="flex items-center gap-1.5">
              <span class="text-sm font-medium text-gray-800">${hTeam?.short_name ?? '?'}</span>
              <span class="diff-pip diff-${hd}"></span>
            </div>
            <div class="text-center">
              <div class="text-xs font-bold text-gray-400 leading-none">VS</div>
              <div class="text-xs text-gray-400 mt-0.5">${date}</div>
            </div>
            <div class="flex items-center gap-1.5 justify-end">
              <span class="diff-pip diff-${ad}"></span>
              <span class="text-sm font-medium text-gray-800">${aTeam?.short_name ?? '?'}</span>
            </div>
            ${aTeam ? shirtImg(aTeam.id, false, 32) : '<div class="w-8 h-8"></div>'}
          </div>`;
      }).join('')}
    </div>`;
}

// ── BEST VALUE ───────────────────────────────

function renderValue() {
  if (!state.loaded) return;
  const valued = state.players
    .filter(p => p.now_cost > 0 && p.total_points > 0)
    .map(p => ({ ...p, valueScore: (p.total_points / (p.now_cost / 10)).toFixed(1) }))
    .sort((a,b) => b.valueScore - a.valueScore)
    .slice(0,15);
  document.getElementById('value-content').innerHTML =
    `<div class="flex flex-col gap-2">${valued.map((p,i) => playerRow(p,i,'value')).join('')}</div>`;
}

// ── DREAM XI ─────────────────────────────────

function generateDream() {
  if (!state.loaded) return;
  const pick = (type, n) =>
    [...state.players.filter(p => p.element_type === type && p.total_points > 10)]
      .sort(() => Math.random() - 0.5).slice(0, n);

  const rows = [
    { players: pick(1,1), isGK: true,  label: 'Goalkeeper' },
    { players: pick(2,4), isGK: false, label: 'Defenders'  },
    { players: pick(3,4), isGK: false, label: 'Midfielders' },
    { players: pick(4,2), isGK: false, label: 'Forwards'   },
  ];

  const card = (p, isGK) => `
    <div class="pitch-card">
      ${shirtImg(p.team, isGK, 52)}
      <div class="text-white text-xs font-semibold mt-1 leading-tight">${p.web_name}</div>
      <div class="text-white/60 text-xs">${teamShortName(p.team)}</div>
      <div class="text-fpl-green text-xs font-bold font-mono mt-0.5">${p.total_points}</div>
    </div>`;

  document.getElementById('dream-content').innerHTML = `
    <div class="pitch-bg rounded-2xl p-6 flex flex-col gap-4 mb-4">
      ${rows.map(r => `<div class="flex justify-center gap-3 flex-wrap">${r.players.map(p=>card(p,r.isGK)).join('')}</div>`).join('')}
    </div>
    <button onclick="generateDream()"
      class="w-full py-3 rounded-xl bg-fpl-purple text-white text-sm font-semibold hover:bg-purple-900 transition-colors">
      ⟳ Generate New Team
    </button>`;
}

// ── MANAGER ──────────────────────────────────

async function lookupManager() {
  const id  = document.getElementById('manager-id').value.trim();
  const el  = document.getElementById('manager-content');
  if (!id) { el.innerHTML = errorHTML('Please enter a Manager ID.'); return; }
  el.innerHTML = spinnerHTML('Looking up manager…');
  try {
    const r = await fetch(PROXY + encodeURIComponent(`${FPL_BASE}/entry/${id}/`));
    if (!r.ok) throw new Error(`Manager not found (${r.status})`);
    const d = await r.json();
    el.innerHTML = `
      <div class="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
        <div class="text-xs text-gray-400 uppercase tracking-widest mb-1">Manager</div>
        <div class="text-xl font-bold text-gray-900">${d.player_first_name} ${d.player_last_name}</div>
        <div class="text-sm text-gray-500 mt-0.5">${d.name}</div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        ${[
          ['Total Points',  d.summary_overall_points],
          ['Overall Rank',  (d.summary_overall_rank||0).toLocaleString()],
          ['GW Points',     d.summary_event_points],
          ['GW Rank',       (d.summary_event_rank||0).toLocaleString()],
        ].map(([label, val]) => `
          <div class="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div class="text-xs text-gray-400 uppercase tracking-widest mb-1">${label}</div>
            <div class="text-2xl font-bold text-fpl-purple">${val}</div>
          </div>`).join('')}
      </div>`;
  } catch(e) {
    el.innerHTML = errorHTML(e.message);
  }
}

document.getElementById('manager-btn').addEventListener('click', lookupManager);
document.getElementById('manager-id').addEventListener('keydown', e => { if(e.key==='Enter') lookupManager(); });

// ── AI ANALYST ───────────────────────────────

function buildFPLContext() {
  if (!state.loaded) return 'FPL data is still loading.';
  const top10 = [...state.players]
    .sort((a,b) => b.total_points - a.total_points).slice(0,10)
    .map(p => `${p.web_name} (${teamShortName(p.team)}, ${posLabel(p.element_type)}) — ${p.total_points}pts, £${(p.now_cost/10).toFixed(1)}m, form:${p.form}`)
    .join('\n');

  const topValue = [...state.players]
    .filter(p => p.now_cost > 0 && p.total_points > 0)
    .map(p => ({ ...p, val: p.total_points / (p.now_cost/10) }))
    .sort((a,b) => b.val - a.val).slice(0,8)
    .map(p => `${p.web_name} (${teamShortName(p.team)}) — ${p.val.toFixed(1)} val, £${(p.now_cost/10).toFixed(1)}m`)
    .join('\n');

  const fixtures = state.fixtures.slice(0,20).map(f => {
    const h = teamById(f.team_h);
    const a = teamById(f.team_a);
    const date = f.kickoff_time ? new Date(f.kickoff_time).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : 'TBC';
    return `${h?.short_name??'?'} vs ${a?.short_name??'?'} (${date}) — home diff:${f.team_h_difficulty} away diff:${f.team_a_difficulty}`;
  }).join('\n');

  const inForm = [...state.players]
    .filter(p => parseFloat(p.form) > 0)
    .sort((a,b) => parseFloat(b.form) - parseFloat(a.form)).slice(0,10)
    .map(p => `${p.web_name} (${teamShortName(p.team)}) — form:${p.form}, selected by ${p.selected_by_percent}%`)
    .join('\n');

  return `
=== FPL DATA SNAPSHOT ===

TOP 10 PLAYERS BY TOTAL POINTS:
${top10}

TOP VALUE PLAYERS (points-per-£1m):
${topValue}

IN-FORM PLAYERS (last 5 GWs):
${inForm}

UPCOMING FIXTURES (next 20):
${fixtures}

=== END OF DATA ===
`.trim();
}

function initAI() {
  // topic buttons
  document.getElementById('ai-topics').addEventListener('click', e => {
    const btn = e.target.closest('.ai-topic');
    if (!btn) return;
    document.querySelectorAll('.ai-topic').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    sendAIMessage(btn.dataset.prompt);
  });

  // welcome suggestion pills
  document.getElementById('ai-messages').addEventListener('click', e => {
    const btn = e.target.closest('.ai-suggestion');
    if (btn) sendAIMessage(btn.dataset.prompt);
  });

  // send button
  document.getElementById('ai-send').addEventListener('click', () => {
    const val = document.getElementById('ai-input').value.trim();
    if (val) sendAIMessage(val);
  });

  // enter to send (shift+enter = newline)
  document.getElementById('ai-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = document.getElementById('ai-input').value.trim();
      if (val) sendAIMessage(val);
    }
  });

  // auto-resize textarea
  document.getElementById('ai-input').addEventListener('input', e => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
  });
}

function appendMessage(role, content, streaming = false) {
  const welcome = document.getElementById('ai-welcome');
  if (welcome) welcome.remove();

  const msgs = document.getElementById('ai-messages');
  const id   = 'msg-' + Date.now();
  const isUser = role === 'user';

  const bubble = document.createElement('div');
  bubble.className = `flex gap-3 ${isUser ? 'justify-end' : ''}`;
  bubble.id = id;
  bubble.innerHTML = isUser ? `
    <div class="max-w-[75%] bg-fpl-purple text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 leading-relaxed">
      ${escHtml(content)}
    </div>` : `
    <div class="w-7 h-7 rounded-full bg-fpl-purple flex items-center justify-center text-fpl-green font-bold text-xs shrink-0 mt-0.5">AI</div>
    <div class="max-w-[80%] bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-800 leading-relaxed prose-bubble shadow-sm">
      ${streaming ? '<span class="inline-block w-0.5 h-3.5 bg-fpl-green cursor align-middle ml-0.5"></span>' : renderMarkdown(content)}
    </div>`;

  msgs.appendChild(bubble);
  msgs.scrollTop = msgs.scrollHeight;
  return id;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMarkdown(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hul])(.+)$/gm, (m,c) => c ? `<p>${c}</p>` : '')
    .replace(/<p><\/p>/g,'');
}

async function sendAIMessage(text) {
  if (!text) return;

  const inputEl = document.getElementById('ai-input');
  const sendBtn = document.getElementById('ai-send');
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;

  // user bubble
  appendMessage('user', text);
  state.aiHistory.push({ role: 'user', content: text });

  // AI bubble with thinking dots while waiting
  const aiId = appendMessage('assistant', '', true);
  const aiBubble = document.querySelector(`#${aiId} .prose-bubble`);
  aiBubble.innerHTML = `
    <span class="dot-1 inline-block w-2 h-2 rounded-full bg-gray-300"></span>
    <span class="dot-2 inline-block w-2 h-2 rounded-full bg-gray-300 mx-1"></span>
    <span class="dot-3 inline-block w-2 h-2 rounded-full bg-gray-300"></span>`;

  try {
    const systemPrompt = `You are an expert Fantasy Premier League (FPL) analyst.
You have access to real-time FPL data injected below. Use it to give specific, data-driven advice.
Be concise but insightful. Use **bold** for player names and key points, bullet lists for multiple options.
Always reference specific stats (points, form, price, fixtures) to justify your recommendations.
Keep responses focused and actionable.

${buildFPLContext()}`;

    const response = await fetch(ANTHROPIC_API(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: state.aiHistory,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message ?? `API error ${response.status}`);
    }

    const reply = data.content?.find(b => b.type === 'text')?.text ?? '';
    state.aiHistory.push({ role: 'assistant', content: reply });

    // typewriter render
    await typewriterRender(aiBubble, reply);

  } catch (e) {
    aiBubble.innerHTML = `<span class="text-red-500">⚠ ${escHtml(e.message)}</span>`;
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

// Typewriter effect — renders markdown incrementally word-by-word
async function typewriterRender(el, fullText) {
  const words = fullText.split(' ');
  let built = '';
  for (let i = 0; i < words.length; i++) {
    built += (i === 0 ? '' : ' ') + words[i];
    el.innerHTML = renderMarkdown(built) +
      '<span class="inline-block w-0.5 h-3.5 bg-fpl-green cursor align-middle ml-0.5"></span>';
    document.getElementById('ai-messages').scrollTop = 999999;
    // fast at start, settle at ~20ms per word
    await new Promise(r => setTimeout(r, 18));
  }
  el.innerHTML = renderMarkdown(fullText);
  document.getElementById('ai-messages').scrollTop = 999999;
}


// ── NAVIGATION ───────────────────────────────

const VIEWS = ['top','search','fixtures','value','dream','manager','ai'];
let fixturesLoaded = false;

document.getElementById('nav').addEventListener('click', e => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  const v = btn.dataset.view;

  document.querySelectorAll('#nav button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  VIEWS.forEach(id => {
    const el = document.getElementById(`view-${id}`);
    if (el) el.classList.toggle('active', id === v);
  });

  if (v === 'fixtures' && !fixturesLoaded) { fixturesLoaded = true; initFixtures(); }
  if (v === 'value')  renderValue();
  if (v === 'dream')  generateDream();
});

// ── BOOT ─────────────────────────────────────
init();