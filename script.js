// ─────────────────────────────────────────────
//  FPL ANALYTICS — script.js
//  AI: Google Gemini 2.0 Flash (free, no proxy needed)
// ─────────────────────────────────────────────

// ── CONFIG ───────────────────────────────────
const PROXY    = 'https://corsproxy.io/?';
const FPL_BASE = 'https://fantasy.premierleague.com/api';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL   = key =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

const SHIRT_URL = (code, isGK = false) =>
  `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${code}${isGK ? '_1' : ''}-66.png`;

// ── STATE ─────────────────────────────────────
const state = {
  players:     [],
  teams:       [],
  fixtures:    [],
  events:      [],       // gameweeks metadata
  loaded:      false,
  teamCodeMap: {},       // team.id → team.code
  aiHistory:   [],       // {role, content}[]
};

// ── KEY HELPERS ──────────────────────────────
function getApiKey() {
  return localStorage.getItem('fpl_gemini_key') ?? '';
}
function saveApiKey(key) {
  localStorage.setItem('fpl_gemini_key', key);
}

// ── FPL HELPERS ──────────────────────────────
async function fetchFPL(path) {
  const r = await fetch(PROXY + encodeURIComponent(FPL_BASE + path));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const teamById      = id   => state.teams.find(t => t.id === id) || null;
const teamShortName = id   => teamById(id)?.short_name ?? '?';
const getTeamCode   = id   => state.teamCodeMap[id] ?? id;
const posLabel      = type => ({ 1:'GKP', 2:'DEF', 3:'MID', 4:'FWD' })[type] ?? '?';

function shirtImg(teamId, isGK = false, size = 44) {
  const src = SHIRT_URL(getTeamCode(teamId), isGK);
  return `<img src="${src}" width="${size}" height="${size}"
    style="object-fit:contain;filter:drop-shadow(0 1px 3px rgba(0,0,0,.15))"
    alt="" onerror="this.style.visibility='hidden'"/>`;
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
  document.getElementById('top-content').innerHTML     = spinnerHTML('Fetching player data…');
  document.getElementById('fixtures-content').innerHTML= spinnerHTML('Loading fixtures…');
  document.getElementById('fdr-content').innerHTML     = spinnerHTML('Building FDR table…');
  document.getElementById('value-content').innerHTML   = spinnerHTML('Calculating value…');
  document.getElementById('dream-content').innerHTML   = spinnerHTML('Assembling squad…');

  try {
    const [bootstrap, fixtureData] = await Promise.all([
      fetchFPL('/bootstrap-static/'),
      fetchFPL('/fixtures/'),
    ]);

    state.players  = bootstrap.elements;
    state.teams    = bootstrap.teams;
    state.events   = bootstrap.events;
    state.fixtures = fixtureData;
    state.teams.forEach(t => { state.teamCodeMap[t.id] = t.code; });
    state.loaded   = true;

    renderTop();
    initSearch();
    renderFDR();
    initApiKey();
    initAI();
  } catch (e) {
    document.getElementById('top-content').innerHTML =
      errorHTML(`Could not load FPL data — API may be unavailable. ${e.message}`);
  }
}

// ── TOP PLAYERS ───────────────────────────────
function renderTop() {
  const top = [...state.players].sort((a,b) => b.total_points - a.total_points).slice(0, 20);
  document.getElementById('top-content').innerHTML =
    `<div class="flex flex-col gap-2">${top.map((p,i) => playerRow(p, i, 'top')).join('')}</div>`;
}

function playerRow(p, i, mode) {
  const pos  = posLabel(p.element_type);
  const isGK = p.element_type === 1;
  const layoutClass = mode === 'value' ? 'value-layout' : 'top-layout';
  const rankLabel   = i >= 0 ? i + 1 : '—';
  const goldClass   = i >= 0 && i < 3 ? 'gold' : '';

  const valueExtra = mode === 'value'
    ? `<span class="val-score">${p.valueScore}✦</span>
       <span class="price">£${(p.now_cost/10).toFixed(1)}m</span>`
    : '';

  return `
    <div class="player-card ${layoutClass}">
      <span class="rank ${goldClass}">${rankLabel}</span>
      ${shirtImg(p.team, isGK, 40)}
      <div>
        <div class="player-name-el">${p.web_name}</div>
        <div class="player-meta">${teamShortName(p.team)} · ${pos}</div>
      </div>
      ${valueExtra}
      <span class="pos-badge ${pos}">${pos}</span>
      <span class="pts">${p.total_points}</span>
    </div>`;
}

// ── SEARCH ───────────────────────────────────
function initSearch() {
  document.getElementById('search-input').addEventListener('input', e => {
    const q       = e.target.value.trim().toLowerCase();
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
  const upcoming = state.fixtures.filter(f => !f.finished).slice(0, 60);
  if (!upcoming.length) {
    document.getElementById('fixtures-content').innerHTML = errorHTML('No upcoming fixtures found.');
    return;
  }
  document.getElementById('fixtures-content').innerHTML =
    `<div class="flex flex-col gap-2">
      ${upcoming.map(f => {
        const hTeam = teamById(f.team_h);
        const aTeam = teamById(f.team_a);
        const hd = f.team_h_difficulty || 3;
        const ad = f.team_a_difficulty || 3;
        const date = f.kickoff_time
          ? new Date(f.kickoff_time).toLocaleDateString('en-GB', {day:'numeric', month:'short'})
          : 'TBC';
        return `
          <div class="bg-white border border-gray-100 rounded-xl px-4 py-2.5 grid items-center gap-3"
               style="grid-template-columns:2.5rem 1fr auto 1fr 2.5rem">
            ${hTeam ? shirtImg(hTeam.id, false, 32) : '<div class="w-8 h-8"></div>'}
            <div class="flex items-center gap-1.5">
              <span class="text-sm font-semibold text-gray-800">${hTeam?.short_name ?? '?'}</span>
              <span class="diff-pip diff-${hd}"></span>
            </div>
            <div class="text-center">
              <div class="text-xs font-bold text-gray-400">VS</div>
              <div class="text-xs text-gray-400 mt-0.5">${date}</div>
            </div>
            <div class="flex items-center gap-1.5 justify-end">
              <span class="diff-pip diff-${ad}"></span>
              <span class="text-sm font-semibold text-gray-800">${aTeam?.short_name ?? '?'}</span>
            </div>
            ${aTeam ? shirtImg(aTeam.id, false, 32) : '<div class="w-8 h-8"></div>'}
          </div>`;
      }).join('')}
    </div>`;
}

// ── FDR TABLE ────────────────────────────────
function renderFDR() {
  // Work out the current/next gameweek
  const currentEvent = state.events.find(e => e.is_current) ||
                       state.events.find(e => e.is_next)    ||
                       state.events[0];
  const startGW = currentEvent ? currentEvent.id : 1;
  const gwRange = Array.from({ length: 8 }, (_, i) => startGW + i).filter(gw => gw <= 38);

  // Build a map: team.id → { gw: [{opponent_short, difficulty, home}] }
  const teamFixMap = {};
  state.teams.forEach(t => { teamFixMap[t.id] = {}; });

  state.fixtures.filter(f => !f.finished && gwRange.includes(f.event)).forEach(f => {
    const gw = f.event;
    // home team
    if (!teamFixMap[f.team_h][gw]) teamFixMap[f.team_h][gw] = [];
    teamFixMap[f.team_h][gw].push({
      opp: teamById(f.team_a)?.short_name ?? '?',
      diff: f.team_h_difficulty,
      home: true,
    });
    // away team
    if (!teamFixMap[f.team_a][gw]) teamFixMap[f.team_a][gw] = [];
    teamFixMap[f.team_a][gw].push({
      opp: teamById(f.team_h)?.short_name ?? '?',
      diff: f.team_a_difficulty,
      home: false,
    });
  });

  // Sort teams by average difficulty across these GWs (easiest first)
  const sortedTeams = [...state.teams].sort((a, b) => {
    const avgDiff = t => {
      const fixtures = gwRange.flatMap(gw => teamFixMap[t.id][gw] || []);
      if (!fixtures.length) return 99;
      return fixtures.reduce((s, f) => s + f.diff, 0) / fixtures.length;
    };
    return avgDiff(a) - avgDiff(b);
  });

  const diffClass = d => d ? `fdr-${Math.min(d, 5)}` : 'fdr-blank';

  const headerRow = `<tr>
    <th class="team-col">Team</th>
    ${gwRange.map(gw => `<th>GW${gw}</th>`).join('')}
  </tr>`;

  const bodyRows = sortedTeams.map(team => {
    const cells = gwRange.map(gw => {
      const fixs = teamFixMap[team.id][gw];
      if (!fixs || !fixs.length) {
        return `<td><span class="fdr-cell fdr-blank">—</span></td>`;
      }
      // DGW: show both
      return `<td>${fixs.map(f => `
        <span class="fdr-cell ${diffClass(f.diff)}" title="Difficulty ${f.diff}">
          ${f.opp}<span style="font-size:.6rem;opacity:.7">${f.home ? 'H' : 'A'}</span>
        </span>`).join('<br/>')}</td>`;
    }).join('');

    const badge = shirtImg(team.id, false, 20);
    return `<tr>
      <td class="team-cell">
        <div class="flex items-center gap-1.5">
          ${badge}
          <span>${team.short_name}</span>
        </div>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  document.getElementById('fdr-content').innerHTML =
    `<table class="fdr-table"><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;
}

// ── BEST VALUE ───────────────────────────────
function renderValue() {
  if (!state.loaded) return;
  const valued = state.players
    .filter(p => p.now_cost > 0 && p.total_points > 0)
    .map(p => ({ ...p, valueScore: (p.total_points / (p.now_cost / 10)).toFixed(1) }))
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, 20);
  document.getElementById('value-content').innerHTML =
    `<div class="flex flex-col gap-2">${valued.map((p, i) => playerRow(p, i, 'value')).join('')}</div>`;
}

// ── DREAM XI ─────────────────────────────────
function generateDream() {
  if (!state.loaded) return;
  const pick = (type, n) =>
    [...state.players.filter(p => p.element_type === type && p.total_points > 10)]
      .sort(() => Math.random() - 0.5).slice(0, n);

  const rows = [
    { players: pick(1, 1), isGK: true  },
    { players: pick(2, 4), isGK: false },
    { players: pick(3, 4), isGK: false },
    { players: pick(4, 2), isGK: false },
  ];

  const card = (p, isGK) => `
    <div class="pitch-card">
      ${shirtImg(p.team, isGK, 52)}
      <div class="text-white text-xs font-semibold mt-1 leading-tight">${p.web_name}</div>
      <div class="text-white/60 text-xs">${teamShortName(p.team)}</div>
      <div class="text-fpl-green text-xs font-bold font-mono mt-0.5">${p.total_points}pts</div>
    </div>`;

  document.getElementById('dream-content').innerHTML = `
    <div class="pitch-bg rounded-2xl p-6 flex flex-col gap-5 mb-4">
      ${rows.map(r => `
        <div class="flex justify-center gap-3 flex-wrap">
          ${r.players.map(p => card(p, r.isGK)).join('')}
        </div>`).join('')}
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
        <div class="text-xl font-bold">${d.player_first_name} ${d.player_last_name}</div>
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
document.getElementById('manager-id').addEventListener('keydown', e => {
  if (e.key === 'Enter') lookupManager();
});

// ── API KEY UI ───────────────────────────────
function initApiKey() {
  const input   = document.getElementById('api-key-input');
  const saveBtn = document.getElementById('api-key-save');
  const status  = document.getElementById('api-key-status');

  const saved = getApiKey();
  if (saved) {
    input.value = saved;
    setStatus('✓ Key saved — ready to chat', 'green');
  }

  saveBtn.addEventListener('click', () => {
    const key = input.value.trim();
    if (!key) { setStatus('Please paste your key first.', 'red'); return; }
    saveApiKey(key);
    setStatus('✓ Key saved — ready to chat', 'green');
    input.type = 'password';
  });

  input.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
  input.addEventListener('focus',   () => { input.type = 'text'; });
  input.addEventListener('blur',    () => { input.type = 'password'; });

  function setStatus(msg, color) {
    const colors = { green: 'text-fpl-green font-medium', red: 'text-red-500', amber: 'text-amber-500' };
    status.textContent = msg;
    status.className   = `text-xs ${colors[color] || 'text-gray-400'}`;
  }
}

// ── AI — CONTEXT BUILDER ─────────────────────
function buildFPLContext() {
  if (!state.loaded) return 'FPL data not yet loaded.';

  const top15 = [...state.players]
    .sort((a, b) => b.total_points - a.total_points).slice(0, 15)
    .map(p => `  ${p.web_name} (${teamShortName(p.team)}, ${posLabel(p.element_type)}) — ${p.total_points}pts, £${(p.now_cost/10).toFixed(1)}m, form:${p.form}, sel:${p.selected_by_percent}%`)
    .join('\n');

  const topValue = [...state.players]
    .filter(p => p.now_cost > 0 && p.total_points > 0)
    .map(p => ({ ...p, val: p.total_points / (p.now_cost / 10) }))
    .sort((a, b) => b.val - a.val).slice(0, 10)
    .map(p => `  ${p.web_name} (${teamShortName(p.team)}, £${(p.now_cost/10).toFixed(1)}m) — ${p.val.toFixed(1)} pts/£m`)
    .join('\n');

  const inForm = [...state.players]
    .filter(p => parseFloat(p.form) > 0)
    .sort((a, b) => parseFloat(b.form) - parseFloat(a.form)).slice(0, 10)
    .map(p => `  ${p.web_name} (${teamShortName(p.team)}) — form:${p.form}, ${p.total_points}pts, sel:${p.selected_by_percent}%`)
    .join('\n');

  const currentEvent = state.events.find(e => e.is_current) || state.events.find(e => e.is_next);
  const startGW = currentEvent?.id ?? 1;
  const upcoming = state.fixtures
    .filter(f => !f.finished && f.event >= startGW && f.event <= startGW + 4)
    .slice(0, 30)
    .map(f => {
      const h = teamById(f.team_h);
      const a = teamById(f.team_a);
      const date = f.kickoff_time
        ? new Date(f.kickoff_time).toLocaleDateString('en-GB', {day:'numeric', month:'short'})
        : 'TBC';
      return `  GW${f.event} ${date}: ${h?.short_name}(H,diff:${f.team_h_difficulty}) vs ${a?.short_name}(A,diff:${f.team_a_difficulty})`;
    }).join('\n');

  return `=== LIVE FPL DATA (GW${startGW}) ===

TOP 15 BY TOTAL POINTS:
${top15}

TOP 10 BY VALUE (pts per £1m):
${topValue}

TOP 10 IN-FORM PLAYERS:
${inForm}

UPCOMING FIXTURES (GW${startGW}–GW${startGW+4}):
${upcoming}

=== END ===`;
}

// ── AI — CHAT ────────────────────────────────
function initAI() {
  document.getElementById('ai-topics').addEventListener('click', e => {
    const btn = e.target.closest('.ai-topic');
    if (!btn) return;
    document.querySelectorAll('.ai-topic').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    sendAIMessage(btn.dataset.prompt);
  });

  document.getElementById('ai-messages').addEventListener('click', e => {
    const btn = e.target.closest('.ai-suggestion');
    if (btn) sendAIMessage(btn.dataset.prompt);
  });

  document.getElementById('ai-send').addEventListener('click', () => {
    const val = document.getElementById('ai-input').value.trim();
    if (val) sendAIMessage(val);
  });

  document.getElementById('ai-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = document.getElementById('ai-input').value.trim();
      if (val) sendAIMessage(val);
    }
  });

  document.getElementById('ai-input').addEventListener('input', e => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
  });
}

function appendMessage(role, html, isStreaming = false) {
  const welcome = document.getElementById('ai-welcome');
  if (welcome) welcome.remove();

  const msgs   = document.getElementById('ai-messages');
  const id     = 'msg-' + Date.now();
  const isUser = role === 'user';

  const el = document.createElement('div');
  el.id = id;
  el.className = `flex gap-3 ${isUser ? 'justify-end' : ''}`;
  el.innerHTML = isUser
    ? `<div class="max-w-[75%] bg-fpl-purple text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 leading-relaxed">${html}</div>`
    : `<div class="w-7 h-7 rounded-full bg-fpl-purple flex items-center justify-center text-fpl-green font-bold text-xs shrink-0 mt-0.5">AI</div>
       <div class="max-w-[80%] bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-800 leading-relaxed prose-bubble shadow-sm">
         ${isStreaming
           ? `<span class="dot-1 inline-block w-2 h-2 rounded-full bg-gray-300 mr-1"></span>
              <span class="dot-2 inline-block w-2 h-2 rounded-full bg-gray-300 mr-1"></span>
              <span class="dot-3 inline-block w-2 h-2 rounded-full bg-gray-300"></span>`
           : html}
       </div>`;

  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return id;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMarkdown(raw) {
  return raw
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h3>$1</h3>')
    .replace(/^[*-] (.+)$/gm,'<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g,'<ul>$1</ul>')
    .replace(/\n{2,}/g,'</p><p>')
    .replace(/\n/g,'<br/>')
    .replace(/^(?!<[hpuol])(.+)/gm,(m,c)=>c?`<p>${c}</p>`:'')
    .replace(/<p><\/p>/g,'');
}

async function typewrite(el, fullText) {
  const words = fullText.split(' ');
  let built = '';
  for (let i = 0; i < words.length; i++) {
    built += (i === 0 ? '' : ' ') + words[i];
    el.innerHTML = renderMarkdown(built) +
      '<span class="cursor inline-block w-0.5 h-3.5 bg-fpl-green align-middle ml-0.5"></span>';
    document.getElementById('ai-messages').scrollTop = 999999;
    await new Promise(r => setTimeout(r, 16));
  }
  el.innerHTML = renderMarkdown(fullText);
  document.getElementById('ai-messages').scrollTop = 999999;
}

async function sendAIMessage(text) {
  if (!text) return;

  const inputEl = document.getElementById('ai-input');
  const sendBtn = document.getElementById('ai-send');
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;

  // Key guard
  const key = getApiKey();
  if (!key) {
    sendBtn.disabled = false;
    const id = appendMessage('assistant', '', false);
    document.querySelector(`#${id} .prose-bubble`).innerHTML =
      `<span class="text-amber-600">⚠ Add your <strong>Gemini API key</strong> in the sidebar to start chatting.
       Get one free at <a href="https://aistudio.google.com/app/apikey" target="_blank" class="underline text-fpl-green">aistudio.google.com</a>.</span>`;
    return;
  }

  // Append user bubble
  appendMessage('user', escHtml(text));
  state.aiHistory.push({ role: 'user', content: text });

  // Thinking bubble
  const aiId     = appendMessage('assistant', '', true);
  const aiBubble = document.querySelector(`#${aiId} .prose-bubble`);

  try {
    // Build Gemini request
    // System context injected as first user/model exchange
    const systemPrompt = `You are an expert Fantasy Premier League (FPL) analyst.
Use the real FPL data below to give specific, data-driven advice.
Be concise but insightful. Use **bold** for player names and key points, and bullet lists for options.
Always cite specific stats (points, form, price, fixture difficulty) to back your recommendations.

${buildFPLContext()}`;

    const geminiContents = [
      { role: 'user',  parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I have the live FPL data and am ready to give expert analysis.' }] },
      ...state.aiHistory.map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    ];

    const response = await fetch(GEMINI_URL(key), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: geminiContents,
        generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message ?? `API error ${response.status}`;
      throw new Error(msg);
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!reply) throw new Error('Empty response from Gemini — please try again.');

    state.aiHistory.push({ role: 'assistant', content: reply });
    await typewrite(aiBubble, reply);

  } catch (e) {
    aiBubble.innerHTML = `<span class="text-red-500">⚠ ${escHtml(e.message)}</span>`;
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

// ── NAVIGATION ───────────────────────────────
const VIEWS = ['top','search','fixtures','fdr','value','dream','manager','ai'];
let fixturesRendered = false;
let valueRendered    = false;

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

  if (v === 'fixtures' && !fixturesRendered) { fixturesRendered = true; renderFixtures(); }
  if (v === 'value'    && !valueRendered)    { valueRendered    = true; renderValue(); }
  if (v === 'dream')   generateDream();
});

// ── BOOT ─────────────────────────────────────
init();