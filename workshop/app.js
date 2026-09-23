// AI Workflow Discovery — YCP Consulting workshop tool.
// Talks only to the ycp-workshop-worker Cloudflare Worker (never to Anthropic directly).

const WORKER_URL = "https://ycp-workshop-worker.dietrichs-mkt.workers.dev";

const PHASES = [
  { id: "context", label: "Context" },
  { id: "workflow", label: "Workflow" },
  { id: "opportunities", label: "Opportunities" },
  { id: "prioritize", label: "Prioritize" },
  { id: "deepdive", label: "Deep Dive" },
  { id: "solutions", label: "Solutions" },
  { id: "pilot", label: "Pilot" },
  { id: "brief", label: "Brief" },
];

const STORAGE_KEY = "ycpWorkshopState";

function defaultState() {
  return {
    key: "",
    mode: "fast",
    phase: 0,
    context: { company: "", website: "", industry: "", name: "", role: "", department: "", responsibility: "", painPoints: "" },
    companyResearch: null,
    workflowActivities: [],
    workflowSub: "list",
    interviewMessages: [],
    interviewTurns: 0,
    workflowMap: null,
    opportunities: [],
    selectedOpportunityId: null,
    deepDiveAnswers: {},
    solutions: [],
    selectedSolutionLabel: null,
    pilot: {},
    briefText: "",
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch {}
  return defaultState();
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

// ---------- AI call helper ----------

async function callAI({ system, messages, webSearch, maxTokens }) {
  const res = await fetch(WORKER_URL + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Workshop-Key": state.key },
    body: JSON.stringify({ system, messages, webSearch: !!webSearch, maxTokens: maxTokens || 4096 }),
  });
  if (res.status === 401) throw new Error("Feil tilgangskode.");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || "AI-kallet feilet. Prøv igjen.");
  }
  return res.json(); // { text, sources }
}

// Tolerant JSON extraction: strips markdown fences, finds the first {...} or [...] block.
function extractJSON(text) {
  const cleaned = text.replace(/```json/gi, "```").replace(/```/g, "");
  const startObj = cleaned.indexOf("{");
  const startArr = cleaned.indexOf("[");
  let start = -1;
  if (startObj === -1) start = startArr;
  else if (startArr === -1) start = startObj;
  else start = Math.min(startObj, startArr);
  if (start === -1) return null;
  const openChar = cleaned[start];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === openChar) depth++;
    else if (cleaned[i] === closeChar) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function escapeHTML(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- Access gate ----------

function initGate() {
  const savedKey = state.key;
  if (savedKey) { showApp(); return; }
  document.getElementById("gate-submit").addEventListener("click", submitGate);
  document.getElementById("gate-key").addEventListener("keydown", (e) => { if (e.key === "Enter") submitGate(); });
}

async function submitGate() {
  const val = document.getElementById("gate-key").value.trim();
  const errEl = document.getElementById("gate-error");
  if (!val) { errEl.textContent = "Skriv inn en kode."; return; }
  errEl.textContent = "Sjekker...";
  const prevKey = state.key;
  state.key = val;
  try {
    // Cheap check: a tiny real call, so a wrong code fails fast with a clear message.
    await callAI({ system: "Reply with exactly: ok", messages: [{ role: "user", content: "ping" }], maxTokens: 8 });
    saveState();
    showApp();
  } catch (e) {
    state.key = prevKey;
    errEl.textContent = e.message || "Kunne ikke verifisere koden.";
  }
}

function showApp() {
  document.getElementById("gate").hidden = true;
  document.getElementById("app").hidden = false;
  render();
}

// ---------- Nav + progress ----------

function renderNav() {
  const nav = document.getElementById("phase-nav");
  const ol = document.createElement("ol");
  PHASES.forEach((p, i) => {
    const li = document.createElement("li");
    li.textContent = p.label;
    if (i < state.phase) li.className = "done";
    else if (i === state.phase) li.className = "active";
    ol.appendChild(li);
  });
  nav.innerHTML = "";
  nav.appendChild(ol);

  document.getElementById("phase-label").textContent = `Fase ${state.phase + 1} / ${PHASES.length}`;
  document.getElementById("progress-fill").style.width = `${((state.phase) / (PHASES.length - 1)) * 100}%`;
}

function goToPhase(i) {
  state.phase = i;
  saveState();
  render();
  window.scrollTo(0, 0);
}

function nextPhase() { goToPhase(Math.min(state.phase + 1, PHASES.length - 1)); }

// ---------- Render dispatcher ----------

function render() {
  renderNav();
  const ws = document.getElementById("workspace");
  ws.innerHTML = "";
  const renderers = [
    renderContext, renderWorkflow, renderOpportunities, renderPrioritize,
    renderDeepDive, renderSolutions, renderPilot, renderBrief,
  ];
  renderers[state.phase](ws);
}

// ============================================================
// Phase 0 — Context
// ============================================================

function renderContext(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">Fase 1 / 8 · Context</p>
      <h1 class="ws-h1">AI Workflow Discovery</h1>
      <p class="ws-lead">Ikke en presentasjon om AI. Dere bruker AI til å analysere egen arbeidshverdag, finne muligheter, og designe én konkret pilot.</p>
    </div>
  `));

  const form = el(`<form id="context-form"></form>`);
  const fields = [
    ["company", "Bedrift", "text", state.context.company],
    ["website", "Nettside", "text", state.context.website],
    ["industry", "Bransje", "text", state.context.industry],
    ["name", "Ditt navn", "text", state.context.name],
    ["role", "Din rolle (f.eks. Drilling Engineer, HR Advisor)", "text", state.context.role],
    ["department", "Avdeling", "text", state.context.department],
  ];
  fields.forEach(([key, label, type, val]) => {
    form.appendChild(el(`
      <div class="field">
        <label>${label}</label>
        <input name="${key}" type="${type}" value="${escapeHTML(val)}">
      </div>
    `));
  });
  form.appendChild(el(`
    <div class="field">
      <label>Hva er 2–3 ting du bruker mye tid på? (valgfritt)</label>
      <textarea name="painPoints">${escapeHTML(state.context.painPoints)}</textarea>
    </div>
  `));
  ws.appendChild(form);

  const modeRow = el(`
    <div class="field">
      <label>Kjøremodus</label>
      <select name="mode">
        <option value="fast" ${state.mode === "fast" ? "selected" : ""}>Fast mode — 60 min</option>
        <option value="deep" ${state.mode === "deep" ? "selected" : ""}>Deep mode — 90 min</option>
      </select>
    </div>
  `);
  ws.appendChild(modeRow);
  modeRow.querySelector("select").addEventListener("change", (e) => {
    state.mode = e.target.value;
    document.getElementById("mode-toggle").textContent = state.mode === "fast" ? "Fast mode" : "Deep mode";
  });

  const btnRow = el(`<div class="btn-row">
    <button id="research-btn" class="btn-ghost">Research bedriften (valgfritt) →</button>
    <button id="start-btn" class="btn-primary">START DISCOVERY →</button>
  </div>`);
  ws.appendChild(btnRow);

  const researchOut = el(`<div id="research-out"></div>`);
  ws.appendChild(researchOut);

  form.querySelectorAll("input, textarea").forEach((input) => {
    input.addEventListener("input", () => { state.context[input.name] = input.value; saveState(); });
  });

  document.getElementById("research-btn").addEventListener("click", async () => {
    if (!state.context.company) { alert("Skriv inn bedriftsnavn først."); return; }
    researchOut.innerHTML = `<p class="chat-thinking">Undersøker ${escapeHTML(state.context.company)}...</p>`;
    try {
      const { text, sources } = await callAI({
        system: "Du er en presis research-assistent for en AI-workshop. Undersøk selskapet brukeren nevner: hva de driver med, bransje, typiske arbeidsprosesser for rollen som er oppgitt, og eventuelle kjente AI-initiativer i bransjen. Bruk websøk. Finn ikke på informasjon — si eksplisitt hva du ikke fant. Svar kort, maks 150 ord, på norsk.",
        messages: [{ role: "user", content: `Bedrift: ${state.context.company}. Nettside: ${state.context.website}. Bransje: ${state.context.industry}. Rolle: ${state.context.role}.` }],
        webSearch: true,
        maxTokens: 700,
      });
      state.companyResearch = text;
      saveState();
      researchOut.innerHTML = `<div class="ws-callout"><span class="cl-label">Research</span><p>${escapeHTML(text)}</p>${renderSources(sources)}</div>`;
    } catch (e) {
      researchOut.innerHTML = `<p class="gate-error">${escapeHTML(e.message)}</p>`;
    }
  });

  document.getElementById("start-btn").addEventListener("click", () => nextPhase());
}

function renderSources(sources) {
  if (!sources || !sources.length) return "";
  return `<p class="ws-sources">Kilder: ${sources.map((s) => `<a href="${escapeHTML(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.title)}</a>`).join(", ")}</p>`;
}

// ============================================================
// Phase 1 — Workflow (list → AI interview → workflow map)
// ============================================================

function renderWorkflow(ws) {
  if (state.workflowSub === "list") return renderWorkflowList(ws);
  if (state.workflowSub === "interview") return renderInterview(ws);
  return renderWorkflowMap(ws);
}

function renderWorkflowList(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">Fase 2 / 8 · Workflow discovery</p>
      <h1 class="ws-h1">Hva gjør du i løpet av en normal arbeidsuke?</h1>
      <p class="ws-lead">Skriv ned 5–10 tilbakevendende oppgaver du gjør som ${escapeHTML(state.context.role) || "i din rolle"}. Ikke tenk AI ennå — bare det du faktisk gjør.</p>
    </div>
  `));
  const box = el(`
    <div class="field" style="max-width:640px">
      <label>Én oppgave per linje</label>
      <textarea id="activities" rows="10" placeholder="F.eks.\nPrepare drilling reports\nReview offset well data\nAnalyse drilling parameters">${escapeHTML(state.workflowActivities.join("\n"))}</textarea>
    </div>
  `);
  ws.appendChild(box);
  ws.appendChild(el(`<div class="btn-row"><button id="to-interview" class="btn-primary">LET AI INTERVIEW YOU →</button></div>`));

  document.getElementById("to-interview").addEventListener("click", () => {
    const lines = document.getElementById("activities").value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { alert("Skriv ned minst én oppgave."); return; }
    state.workflowActivities = lines;
    state.workflowSub = "interview";
    if (state.interviewMessages.length === 0) {
      state.interviewMessages.push({ role: "assistant", content: `Du nevnte: "${lines[0]}". Gå gjennom nøyaktig hva som skjer fra du starter denne oppgaven til du er ferdig — steg for steg.` });
    }
    saveState();
    render();
  });
}

function interviewSystemPrompt() {
  return `Du er en kritisk, nysgjerrig, praktisk AI-konsulent som intervjuer en ansatt (rolle: ${state.context.role || "ukjent"}, avdeling: ${state.context.department || "ukjent"}, bedrift: ${state.context.company || "ukjent"}) om arbeidsflyten deres, for å forberede en AI-discovery-workshop.
Oppgaver personen nevnte: ${state.workflowActivities.join("; ")}.
Still ETT spørsmål om gangen, kort og konkret (maks 2 setninger). Dekk over tid: hva som skjer steg for steg, hvor ofte, hvor lang tid det tar, hvilken info som trengs, hvor informasjonen kommer fra, hva som er vanskelig, hvilke deler krever skjønn, hvilke deler er repetitive, hvor de søker informasjon, hva som forårsaker "rework".
Ikke foreslå AI-løsninger ennå. Ikke oppsummer med mindre du blir bedt om det. Svar KUN med selve spørsmålet, ingen innledning, på norsk.`;
}

function renderInterview(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">Fase 2 / 8 · AI-intervju</p>
      <h1 class="ws-h1">Fortell om arbeidsflyten din</h1>
      <p class="ws-lead">AI-en stiller ett spørsmål om gangen. Svar så konkret du kan. ${state.mode === "fast" ? "5–8" : "8–12"} spørsmål er vanligvis nok.</p>
    </div>
  `));

  const log = el(`<div class="chat-log"></div>`);
  state.interviewMessages.forEach((m) => {
    log.appendChild(el(`<div class="chat-turn ${m.role === "assistant" ? "ai" : "user"}"><div class="chat-bubble2">${escapeHTML(m.content)}</div></div>`));
  });
  ws.appendChild(log);

  const inputRow = el(`
    <div class="chat-input-row">
      <textarea id="interview-answer" placeholder="Skriv svaret ditt..."></textarea>
      <button id="interview-send" class="btn-primary">Send</button>
    </div>
  `);
  ws.appendChild(inputRow);

  ws.appendChild(el(`<div class="btn-row">
    <button id="interview-done" class="btn-ghost">Nok spørsmål — bygg arbeidsflyten →</button>
  </div>`));

  document.getElementById("interview-send").addEventListener("click", () => sendInterviewAnswer());
  document.getElementById("interview-answer").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendInterviewAnswer(); }
  });
  document.getElementById("interview-done").addEventListener("click", () => buildWorkflowMap());
}

async function sendInterviewAnswer() {
  const ta = document.getElementById("interview-answer");
  const val = ta.value.trim();
  if (!val) return;
  state.interviewMessages.push({ role: "user", content: val });
  state.interviewTurns++;
  saveState();
  render();

  const ws = document.getElementById("workspace");
  ws.appendChild(el(`<p class="chat-thinking">AI-en tenker...</p>`));

  const targetTurns = state.mode === "fast" ? 6 : 10;
  if (state.interviewTurns >= targetTurns) {
    return buildWorkflowMap();
  }

  try {
    const { text } = await callAI({
      system: interviewSystemPrompt(),
      messages: state.interviewMessages.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: 300,
    });
    state.interviewMessages.push({ role: "assistant", content: text.trim() });
    saveState();
    render();
  } catch (e) {
    alert(e.message);
    render();
  }
}

async function buildWorkflowMap() {
  const ws = document.getElementById("workspace");
  ws.innerHTML = `<p class="chat-thinking">Bygger arbeidsflyt-kartet...</p>`;
  try {
    const { text } = await callAI({
      system: `Basert på dette intervjuet, bygg en strukturert arbeidsflyt som en JSON-liste av steg. Hvert steg: {"label": kort fase-navn (f.eks. "Input", "Søk", "Analyse", "Vurdering", "Output"), "title": konkret beskrivelse, "time": tidsestimat, "frequency": hvor ofte, "tools": verktøy/systemer brukt, "painPoints": kort om hva som er vanskelig}. 4-7 steg, i rekkefølge. Svar KUN med gyldig JSON, en liste, ingen forklaring, på norsk.`,
      messages: state.interviewMessages.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: 1200,
    });
    const parsed = extractJSON(text);
    state.workflowMap = Array.isArray(parsed) ? parsed : [];
    state.workflowSub = "map";
    saveState();
    render();
  } catch (e) {
    ws.innerHTML = `<p class="gate-error">${escapeHTML(e.message)}</p><button class="btn-ghost" onclick="buildWorkflowMap()">Prøv igjen</button>`;
  }
}

function renderWorkflowMap(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">Fase 2 / 8 · Arbeidsflyt-kart</p>
      <h1 class="ws-h1">Slik ser arbeidsflyten ut</h1>
      <p class="ws-lead">Sjekk at dette stemmer før dere går videre til å lete etter muligheter.</p>
    </div>
  `));
  const flow = el(`<div class="node-flow"></div>`);
  (state.workflowMap || []).forEach((node, i) => {
    flow.appendChild(el(`
      <div class="node-box">
        <div class="node-label">${escapeHTML(node.label || "Steg " + (i + 1))}</div>
        <div class="node-title">${escapeHTML(node.title || "")}</div>
        <div class="node-meta">${escapeHTML(node.time || "")}${node.frequency ? " · " + escapeHTML(node.frequency) : ""}${node.tools ? " · " + escapeHTML(node.tools) : ""}</div>
        ${node.painPoints ? `<div class="node-meta" style="margin-top:6px;color:#b45; ">⚠ ${escapeHTML(node.painPoints)}</div>` : ""}
      </div>
    `));
    if (i < state.workflowMap.length - 1) flow.appendChild(el(`<div class="node-arrow">↓</div>`));
  });
  ws.appendChild(flow);
  ws.appendChild(el(`<div class="btn-row">
    <button id="redo-interview" class="btn-ghost">Tilbake til intervjuet</button>
    <button id="to-opportunities" class="btn-primary">Finn AI-muligheter →</button>
  </div>`));
  document.getElementById("redo-interview").addEventListener("click", () => { state.workflowSub = "interview"; saveState(); render(); });
  document.getElementById("to-opportunities").addEventListener("click", () => nextPhase());
}

// ============================================================
// Phase 2 — Opportunities
// ============================================================

function renderOpportunities(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">Fase 3 / 8 · AI Opportunity Discovery</p>
      <h1 class="ws-h1">Hvor kan denne arbeidsflyten forbedres?</h1>
      <p class="ws-lead">AI-en vurderer tre typer løsning for hvert steg: AI, automatisering/vanlig programvare, og prosessforbedring. Den skal ikke anta at AI automatisk er svaret.</p>
    </div>
  `));

  if (state.opportunities.length === 0) {
    const btn = el(`<button id="gen-opp" class="btn-primary">GENERATE OPPORTUNITIES →</button>`);
    ws.appendChild(btn);
    btn.addEventListener("click", generateOpportunities);
    return;
  }

  const grid = el(`<div class="card-grid"></div>`);
  state.opportunities.forEach((o) => {
    const card = el(`
      <div class="opp-card">
        <span class="opp-cluster">${escapeHTML(o.cluster || "")}</span>
        <span class="badge b-${(o.opportunityType || "ai").toLowerCase()}">${escapeHTML(o.opportunityType || "AI")}</span>
        <h4>${escapeHTML(o.title)}</h4>
        <p><strong>Problem:</strong> ${escapeHTML(o.problem)}</p>
        <p><strong>Hvorfor:</strong> ${escapeHTML(o.whyHelp)}</p>
        <p><strong>Alternativ:</strong> ${escapeHTML(o.alternative)}</p>
        ${o.challenge ? `<div class="ws-callout"><span class="cl-label">Kritisk motsjekk</span><p>${escapeHTML(o.challenge)}</p></div>` : ""}
        <label style="display:flex; gap:8px; align-items:center; font-size:13px; margin-top:10px;">
          <input type="radio" name="opp-select" value="${o.id}" ${state.selectedOpportunityId === o.id ? "checked" : ""}> Velg denne til prioritering
        </label>
      </div>
    `);
    grid.appendChild(card);
  });
  ws.appendChild(grid);
  grid.querySelectorAll('input[name="opp-select"]').forEach((r) => {
    r.addEventListener("change", (e) => { state.selectedOpportunityId = e.target.value; saveState(); });
  });

  ws.appendChild(el(`<div class="btn-row">
    <button id="regen-opp" class="btn-ghost">Generer flere</button>
    <button id="to-prioritize" class="btn-primary">TIL PRIORITERING →</button>
  </div>`));
  document.getElementById("regen-opp").addEventListener("click", generateOpportunities);
  document.getElementById("to-prioritize").addEventListener("click", () => nextPhase());
}

async function generateOpportunities() {
  const ws = document.getElementById("workspace");
  ws.innerHTML = `<p class="chat-thinking">Genererer og kritisk-vurderer muligheter...</p>`;
  try {
    const { text } = await callAI({
      system: `Basert på arbeidsflyten under, generer 6-9 mulige forbedringer. IKKE anta at AI alltid er riktig løsning: vurder AI, Automation/vanlig programvare, og Process improvement.
For hver: {"id": kort unik streng, "cluster": tema-gruppe (f.eks. "Informasjonssøk", "Rapportering", "Analyse"), "opportunityType": "AI"|"Automation"|"Process", "title": kort tittel, "problem": problembeskrivelse, "whyHelp": hvorfor denne løsningen kan hjelpe, "alternative": et konkret ikke-AI-alternativ, "challenge": en kritisk motsjekk — hvorfor dette KANSKJE ikke fungerer, skjulte antagelser, hva som må verifiseres, og om AI faktisk er nødvendig.
Svar KUN med en gyldig JSON-liste, på norsk.`,
      messages: [{ role: "user", content: `Rolle: ${state.context.role}. Arbeidsflyt: ${JSON.stringify(state.workflowMap)}` }],
      maxTokens: 3000,
    });
    const parsed = extractJSON(text);
    state.opportunities = Array.isArray(parsed) ? parsed : [];
    saveState();
    render();
  } catch (e) {
    ws.innerHTML = `<p class="gate-error">${escapeHTML(e.message)}</p><button class="btn-ghost" onclick="generateOpportunities()">Prøv igjen</button>`;
  }
}

// ============================================================
// Phase 3 — Prioritize
// ============================================================

const SCORE_DIMS = [
  ["impact", "Impact"], ["frequency", "Frequency"], ["timeSaved", "Time saved"],
  ["feasibility", "Feasibility"], ["data", "Data readiness"], ["risk", "Risk"], ["timeToValue", "Time to value"],
];

function renderPrioritize(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">Fase 4 / 8 · Prioritering</p>
      <h1 class="ws-h1">Velg det beste problemet, ikke bare den kuleste ideen</h1>
      <p class="ws-lead">Score hver mulighet 0–5 på hver dimensjon. Totalscoren er et hjelpemiddel, ikke en fasit — dere kan overstyre den.</p>
    </div>
  `));

  if (state.opportunities.length === 0) {
    ws.appendChild(el(`<p>Ingen muligheter generert ennå. Gå tilbake til forrige fase.</p>`));
    return;
  }

  const table = el(`<table class="scorecard"><thead><tr><th>Use case</th>${SCORE_DIMS.map(([, l]) => `<th>${l}</th>`).join("")}<th>Score</th></tr></thead><tbody></tbody></table>`);
  const tbody = table.querySelector("tbody");
  state.opportunities.forEach((o) => {
    o.scores = o.scores || {};
    const row = el(`<tr><td>${escapeHTML(o.title)}</td></tr>`);
    SCORE_DIMS.forEach(([key]) => {
      const cell = el(`<td><input type="number" min="0" max="5" data-opp="${o.id}" data-dim="${key}" value="${o.scores[key] ?? ""}"></td>`);
      row.appendChild(cell);
    });
    const scoreCell = el(`<td class="sc-score" id="score-${o.id}">${computeScore(o)}</td>`);
    row.appendChild(scoreCell);
    tbody.appendChild(row);
  });
  ws.appendChild(table);

  table.querySelectorAll("input[type=number]").forEach((input) => {
    input.addEventListener("input", () => {
      const opp = state.opportunities.find((o) => o.id === input.dataset.opp);
      opp.scores[input.dataset.dim] = Number(input.value) || 0;
      saveState();
      document.getElementById("score-" + opp.id).textContent = computeScore(opp);
      renderMatrix();
    });
  });

  ws.appendChild(el(`<div id="matrix-wrap"></div>`));
  renderMatrix();

  const selectField = el(`
    <div class="field">
      <label>Valgt use case for deep dive</label>
      <select id="pick-opp">
        <option value="">— velg —</option>
        ${state.opportunities.map((o) => `<option value="${o.id}" ${state.selectedOpportunityId === o.id ? "selected" : ""}>${escapeHTML(o.title)}</option>`).join("")}
      </select>
    </div>
  `);
  ws.appendChild(selectField);
  selectField.querySelector("select").addEventListener("change", (e) => { state.selectedOpportunityId = e.target.value; saveState(); });

  ws.appendChild(el(`<div class="btn-row"><button id="to-deepdive" class="btn-primary">DEEP DIVE PÅ VALGT USE CASE →</button></div>`));
  document.getElementById("to-deepdive").addEventListener("click", () => {
    if (!state.selectedOpportunityId) { alert("Velg en use case først."); return; }
    nextPhase();
  });
}

function computeScore(o) {
  const s = o.scores || {};
  const vals = SCORE_DIMS.map(([k]) => s[k] || 0);
  return vals.reduce((a, b) => a + b, 0);
}

function renderMatrix() {
  const wrap = document.getElementById("matrix-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";
  const matrix = el(`
    <div class="matrix">
      <span class="matrix-label top-left">Strategic</span>
      <span class="matrix-label top-right">Quick wins</span>
      <span class="matrix-label bottom-left">Low priority</span>
      <span class="matrix-label bottom-right">Low-hanging fruit</span>
      <span class="matrix-axis-y">Impact →</span>
      <span class="matrix-axis-x">Feasibility →</span>
    </div>
  `);
  state.opportunities.forEach((o) => {
    const s = o.scores || {};
    const impact = ((s.impact || 0) + (s.timeSaved || 0)) / 2 / 5; // 0..1
    const feas = ((s.feasibility || 0) + (s.data || 0)) / 2 / 5;
    const dot = el(`<div class="matrix-dot" style="left:${feas * 100}%; bottom:${impact * 100}%;" title="${escapeHTML(o.title)}"></div>`);
    matrix.appendChild(dot);
  });
  wrap.appendChild(matrix);
}

// ============================================================
// Phase 4 — Deep Dive
// ============================================================

const DEEPDIVE_QUESTIONS = [
  ["currentState", "How is this done today?"],
  ["people", "Who is involved?"],
  ["systems", "Which systems are involved?"],
  ["data", "What information is required?"],
  ["inputs", "What goes into the process?"],
  ["outputs", "What should come out?"],
  ["exceptions", "When does the normal process fail?"],
  ["judgement", "Where is human judgement required?"],
  ["risks", "What could go wrong?"],
  ["success", "What would a much better process look like?"],
];

function renderDeepDive(ws) {
  const opp = state.opportunities.find((o) => o.id === state.selectedOpportunityId);
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">Fase 5 / 8 · Deep Dive</p>
      <h1 class="ws-h1">Nå undersøker dere: ${escapeHTML(opp ? opp.title : "")}</h1>
      <p class="ws-lead">Forstå problemet ordentlig før dere designer løsningen. Fyll ut det dere vet — det som er ukjent er også nyttig informasjon.</p>
    </div>
  `));

  const list = el(`<div class="qa-list"></div>`);
  DEEPDIVE_QUESTIONS.forEach(([key, q]) => {
    list.appendChild(el(`
      <div class="qa-item">
        <div class="qa-q">${q}</div>
        <textarea data-key="${key}">${escapeHTML(state.deepDiveAnswers[key] || "")}</textarea>
      </div>
    `));
  });
  ws.appendChild(list);
  list.querySelectorAll("textarea").forEach((t) => {
    t.addEventListener("input", () => { state.deepDiveAnswers[t.dataset.key] = t.value; saveState(); });
  });

  ws.appendChild(el(`<div class="btn-row"><button id="to-solutions" class="btn-primary">UTFORSK LØSNINGER →</button></div>`));
  document.getElementById("to-solutions").addEventListener("click", () => nextPhase());
}

// ============================================================
// Phase 5 — Solutions
// ============================================================

function renderSolutions(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">Fase 6 / 8 · Solution Exploration</p>
      <h1 class="ws-h1">Ikke bli forelsket i den første løsningen</h1>
      <p class="ws-lead">AI-en genererer flere løsningsalternativer. Bruk "Challenge this solution" på favoritten før dere velger.</p>
    </div>
  `));

  if (state.solutions.length === 0) {
    const btn = el(`<button id="gen-sol" class="btn-primary">GENERATE SOLUTIONS →</button>`);
    ws.appendChild(btn);
    btn.addEventListener("click", generateSolutions);
    return;
  }

  const grid = el(`<div class="card-grid"></div>`);
  state.solutions.forEach((s) => {
    const card = el(`
      <div class="opp-card">
        <span class="opp-cluster">Løsning ${escapeHTML(s.label)}</span>
        <h4>${escapeHTML(s.name)}</h4>
        <p><strong>Arkitektur:</strong> ${escapeHTML(s.architecture)}</p>
        <p><strong>Human-in-the-loop:</strong> ${escapeHTML(s.humanInLoop)}</p>
        <p><strong>Kompleksitet:</strong> ${escapeHTML(s.complexity)} · <strong>Innsats:</strong> ${escapeHTML(s.effort)}</p>
        <p><strong>Forventet gevinst:</strong> ${escapeHTML(s.benefit)}</p>
        ${s.challengeResult ? `<div class="ws-callout"><span class="cl-label">Kritisk utfordring</span><p>${escapeHTML(s.challengeResult)}</p></div>` : `<button class="btn-ghost challenge-btn" data-label="${s.label}">CHALLENGE THIS SOLUTION</button>`}
        <label style="display:flex; gap:8px; align-items:center; font-size:13px; margin-top:10px;">
          <input type="radio" name="sol-select" value="${s.label}" ${state.selectedSolutionLabel === s.label ? "checked" : ""}> Velg denne
        </label>
      </div>
    `);
    grid.appendChild(card);
  });
  ws.appendChild(grid);

  grid.querySelectorAll(".challenge-btn").forEach((btn) => {
    btn.addEventListener("click", () => challengeSolution(btn.dataset.label));
  });
  grid.querySelectorAll('input[name="sol-select"]').forEach((r) => {
    r.addEventListener("change", (e) => { state.selectedSolutionLabel = e.target.value; saveState(); });
  });

  ws.appendChild(el(`<div class="btn-row"><button id="to-pilot" class="btn-primary">DESIGN PILOTEN →</button></div>`));
  document.getElementById("to-pilot").addEventListener("click", () => {
    if (!state.selectedSolutionLabel) { alert("Velg en løsning først."); return; }
    nextPhase();
  });
}

async function generateSolutions() {
  const ws = document.getElementById("workspace");
  ws.innerHTML = `<p class="chat-thinking">Genererer løsningsalternativer...</p>`;
  const opp = state.opportunities.find((o) => o.id === state.selectedOpportunityId);
  try {
    const { text } = await callAI({
      system: `Generer 3-4 løsningsalternativer (merk A, B, C, valgfritt D) for problemet under, inkludert minst ett tradisjonelt/ikke-AI-alternativ hvis relevant.
For hver: {"label":"A", "name": kort navn, "architecture": kort beskrivelse av oppbygning, "inputs":"", "processing":"", "output":"", "humanInLoop": hvor mennesker må godkjenne/sjekke, "systems": nødvendige systemer, "data": nødvendig data, "complexity":"lav/middels/høy", "risks":"", "effort": grovt anslag, "benefit": forventet gevinst.
Svar KUN med en gyldig JSON-liste, på norsk.`,
      messages: [{ role: "user", content: `Use case: ${opp ? opp.title + " — " + opp.problem : ""}. Deep dive: ${JSON.stringify(state.deepDiveAnswers)}` }],
      maxTokens: 2500,
    });
    const parsed = extractJSON(text);
    state.solutions = Array.isArray(parsed) ? parsed : [];
    saveState();
    render();
  } catch (e) {
    ws.innerHTML = `<p class="gate-error">${escapeHTML(e.message)}</p><button class="btn-ghost" onclick="generateSolutions()">Prøv igjen</button>`;
  }
}

async function challengeSolution(label) {
  const sol = state.solutions.find((s) => s.label === label);
  if (!sol) return;
  const ws = document.getElementById("workspace");
  const prior = ws.innerHTML;
  ws.innerHTML = `<p class="chat-thinking">Utfordrer løsning ${label}...</p>`;
  try {
    const { text } = await callAI({
      system: `Anta at den foreslåtte løsningen er feil. Prøv å motbevise den. Identifiser skjulte antagelser, tekniske begrensninger, dataproblemer, sikkerhetsbekymringer, arbeidsflyt-problemer, adopsjonsbarrierer, og situasjoner hvor løsningen ville feilet. Foreslå bedre alternativer hvis relevant. Svar kort (maks 120 ord), konkret, på norsk. Ikke fabrikker fagkompetanse du ikke har — si eksplisitt at fagfolk må validere tekniske detaljer der det er relevant.`,
      messages: [{ role: "user", content: `Løsning: ${JSON.stringify(sol)}` }],
      maxTokens: 500,
    });
    sol.challengeResult = text.trim();
    saveState();
    render();
  } catch (e) {
    ws.innerHTML = prior;
    alert(e.message);
  }
}

// ============================================================
// Phase 6 — Pilot design
// ============================================================

const PILOT_FIELDS = [
  ["problem", "Problem", "What exactly are we solving?"],
  ["currentProcess", "Current process", "How does it work today?"],
  ["proposedSolution", "Proposed solution", "What will we build/test?"],
  ["users", "Users", "Who will use it?"],
  ["inputs", "Inputs", "What information does it need?"],
  ["outputs", "Outputs", "What should it produce?"],
  ["humanControl", "Human control", "Where must humans approve/check?"],
  ["systems", "Systems", "What systems does it need to interact with?"],
  ["data", "Data", "What data is needed?"],
  ["security", "Security", "What information must be protected?"],
  ["successMetric", "Success metric", "How will we know the pilot works?"],
  ["scope", "Pilot scope", "What is deliberately NOT included?"],
];

function renderPilot(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">Fase 7 / 8 · Pilot Design</p>
      <h1 class="ws-h1">Gjør ideen om til en pilot</h1>
      <p class="ws-lead">Fyll ut selv, eller la AI-en foreslå et førsteutkast basert på alt dere har gjort så langt.</p>
    </div>
  `));

  ws.appendChild(el(`<button id="draft-pilot" class="btn-ghost" style="margin-bottom:20px;">La AI foreslå et utkast →</button>`));

  const list = el(`<div class="qa-list"></div>`);
  PILOT_FIELDS.forEach(([key, label, hint]) => {
    list.appendChild(el(`
      <div class="qa-item">
        <div class="qa-q">${label}</div>
        <p class="field-hint" style="margin-bottom:6px;">${hint}</p>
        <textarea data-key="${key}">${escapeHTML(state.pilot[key] || "")}</textarea>
      </div>
    `));
  });
  ws.appendChild(list);
  list.querySelectorAll("textarea").forEach((t) => {
    t.addEventListener("input", () => { state.pilot[t.dataset.key] = t.value; saveState(); });
  });

  ws.appendChild(el(`<div class="btn-row"><button id="to-brief" class="btn-primary">GENERER PILOT BRIEF →</button></div>`));
  document.getElementById("draft-pilot").addEventListener("click", draftPilot);
  document.getElementById("to-brief").addEventListener("click", () => nextPhase());
}

async function draftPilot() {
  const ws = document.getElementById("workspace");
  const opp = state.opportunities.find((o) => o.id === state.selectedOpportunityId);
  const sol = state.solutions.find((s) => s.label === state.selectedSolutionLabel);
  const btn = document.getElementById("draft-pilot");
  btn.textContent = "Skriver utkast...";
  btn.disabled = true;
  try {
    const { text } = await callAI({
      system: `Fyll ut et pilotdesign som JSON med nøklene: problem, currentProcess, proposedSolution, users, inputs, outputs, humanControl, systems, data, security, successMetric, scope. Basér deg på informasjonen under. Vær konkret og kort per felt (1-3 setninger). Svar KUN med gyldig JSON, på norsk.`,
      messages: [{ role: "user", content: `Use case: ${JSON.stringify(opp)}. Deep dive: ${JSON.stringify(state.deepDiveAnswers)}. Valgt løsning: ${JSON.stringify(sol)}.` }],
      maxTokens: 1500,
    });
    const parsed = extractJSON(text) || {};
    state.pilot = Object.assign({}, state.pilot, parsed);
    saveState();
    render();
  } catch (e) {
    alert(e.message);
    btn.textContent = "La AI foreslå et utkast →";
    btn.disabled = false;
  }
}

// ============================================================
// Phase 7 — Final brief
// ============================================================

function renderBrief(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">Fase 8 / 8 · Pilot Brief</p>
      <h1 class="ws-h1">Dette er det dere går ut av rommet med</h1>
    </div>
  `));

  if (!state.briefText) {
    const btn = el(`<button id="gen-brief" class="btn-primary">GENERATE PILOT BRIEF →</button>`);
    ws.appendChild(btn);
    btn.addEventListener("click", generateBrief);
    return;
  }

  const doc = el(`<div class="brief-doc" id="brief-doc"></div>`);
  doc.innerHTML = briefToHTML(state.briefText);
  ws.appendChild(doc);

  ws.appendChild(el(`<div class="btn-row">
    <button id="regen-brief" class="btn-ghost">Generer på nytt</button>
    <button id="copy-brief" class="btn-ghost">Kopier til utklippstavle</button>
    <button id="md-brief" class="btn-ghost">Last ned som Markdown</button>
    <button id="pdf-brief" class="btn-primary">Skriv ut / lagre som PDF</button>
  </div>`));

  document.getElementById("regen-brief").addEventListener("click", generateBrief);
  document.getElementById("copy-brief").addEventListener("click", () => {
    navigator.clipboard.writeText(state.briefText).then(() => alert("Kopiert."));
  });
  document.getElementById("md-brief").addEventListener("click", () => {
    const blob = new Blob([state.briefText], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pilot-brief-${(state.context.company || "ycp").toLowerCase().replace(/\s+/g, "-")}.md`;
    a.click();
  });
  document.getElementById("pdf-brief").addEventListener("click", () => {
    const root = document.getElementById("print-root");
    root.innerHTML = `<div class="brief-doc">${briefToHTML(state.briefText)}</div>`;
    window.print();
  });

  const cta = el(`
    <div>
      <h2 style="margin-top:48px;">Dere har identifisert en mulighet. Nå må dere teste om den faktisk fungerer.</h2>
      <div class="cta-options">
        <div class="cta-option">
          <h4>Explore internally</h4>
          <p>Ta med pilotbrief-en og diskuter den internt før dere bestemmer neste steg. Se også <a href="../ai-tips-for-ingeniorer/" target="_blank" rel="noopener">AI-verktøykassen for ingeniører</a> for konkrete Skills og verktøy dere kan ta i bruk med det samme.</p>
        </div>
        <div class="cta-option highlight">
          <h4>Build a pilot with YCP</h4>
          <p>Vi hjelper dere å gjøre det valgte use-caset om til en fungerende prototype.</p>
          <a href="mailto:kontakt@ycpconsulting.no" class="btn-primary" style="text-decoration:none;">DISCUSS THE PILOT →</a>
        </div>
      </div>
    </div>
  `);
  ws.appendChild(cta);
}

async function generateBrief() {
  const ws = document.getElementById("workspace");
  ws.innerHTML = `<p class="chat-thinking">Setter sammen pilot brief-en...</p>`;
  const opp = state.opportunities.find((o) => o.id === state.selectedOpportunityId);
  const sol = state.solutions.find((s) => s.label === state.selectedSolutionLabel);
  try {
    const { text } = await callAI({
      system: `Skriv en profesjonell "AI Pilot Brief" i Markdown, på norsk, med nøyaktig disse seksjonene som ## overskrifter: Selskap, Avdeling, Rolle, 1. Problem, 2. Nåværende arbeidsflyt, 3. Identifisert mulighet, 4. Hvorfor det er viktig, 5. Foreslått løsning, 6. Alternative løsninger vurdert, 7. Nødvendig data, 8. Involverte systemer, 9. Menneskelig involvering, 10. Risiko/ukjente faktorer, 11. Pilotomfang, 12. Suksesskriterier, 13. Estimert innsats, 14. Anbefalt neste steg, 15. Pilot-eier.
Skal lese som et konsulentdokument, ikke en AI-generert rapport: konkret, kort per seksjon, ingen fyllord.`,
      messages: [{ role: "user", content: `Kontekst: ${JSON.stringify(state.context)}. Valgt use case: ${JSON.stringify(opp)}. Deep dive: ${JSON.stringify(state.deepDiveAnswers)}. Valgt løsning: ${JSON.stringify(sol)}. Pilotdesign: ${JSON.stringify(state.pilot)}.` }],
      maxTokens: 3000,
    });
    state.briefText = text.trim();
    saveState();
    render();
  } catch (e) {
    ws.innerHTML = `<p class="gate-error">${escapeHTML(e.message)}</p><button class="btn-ghost" onclick="generateBrief()">Prøv igjen</button>`;
  }
}

// Minimal markdown → HTML for the brief (## headings, paragraphs, - lists).
function briefToHTML(md) {
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (inList) { html += "</ul>"; inList = false; } continue; }
    if (line.startsWith("## ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h2>${escapeHTML(line.slice(3))}</h2>`;
    } else if (line.startsWith("# ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h2>${escapeHTML(line.slice(2))}</h2>`;
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${escapeHTML(line.replace(/^[-*]\s+/, ""))}</li>`;
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${escapeHTML(line)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}

// ---------- Mode toggle button ----------

document.addEventListener("DOMContentLoaded", () => {
  initGate();
  const modeBtn = document.getElementById("mode-toggle");
  modeBtn.textContent = state.mode === "fast" ? "Fast mode" : "Deep mode";
  modeBtn.addEventListener("click", () => {
    state.mode = state.mode === "fast" ? "deep" : "fast";
    modeBtn.textContent = state.mode === "fast" ? "Fast mode" : "Deep mode";
    saveState();
  });
});
