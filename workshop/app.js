// AI Workflow Discovery — YCP Consulting workshop tool.
// Bring-your-own-Claude: no API key, no backend. Each step shows a ready-made
// prompt to copy into the participant's own Claude.ai conversation; they paste
// the result back in, and the tool parses/renders it. Bilingual (NO/EN).

const PHASES = ["context", "workflow", "opportunities", "prioritize", "deepdive", "solutions", "pilot", "brief"];
const STORAGE_KEY = "ycpWorkshopState";

function defaultState() {
  return {
    lang: "no",
    mode: "fast",
    phase: 0,
    context: { company: "", website: "", industry: "", name: "", role: "", department: "", responsibility: "", painPoints: "" },
    companyResearch: null,
    workflowActivities: [],
    workflowSub: "list",
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

function t(key) {
  const dict = T[state.lang] || T.no;
  return (key in dict) ? dict[key] : (T.no[key] || key);
}

// ---------- Helpers ----------

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
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

// ---------- Reusable copy-prompt / paste-result block ----------

function renderCopyPasteBlock(container, promptText, onContinue, opts) {
  opts = opts || {};
  container.appendChild(el(`
    <ol class="copy-steps">
      <li>${t("csStep1")}</li>
      <li>${t("csStep2")}</li>
      <li>${t("csStep3")}</li>
    </ol>
  `));

  const boxWrap = el(`<div class="prompt-box-wrap"></div>`);
  const box = document.createElement("div");
  box.className = "prompt-box";
  box.textContent = promptText;
  boxWrap.appendChild(box);
  const btnRow = el(`
    <div class="copy-btn-row">
      <button type="button" class="btn-ghost copy-prompt-btn">${t("copyPrompt")}</button>
      <span class="copied-note">${t("copied")}</span>
    </div>
  `);
  boxWrap.appendChild(btnRow);
  container.appendChild(boxWrap);

  btnRow.querySelector(".copy-prompt-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(promptText).then(() => {
      const note = btnRow.querySelector(".copied-note");
      note.classList.add("show");
      setTimeout(() => note.classList.remove("show"), 2000);
    });
  });

  const pasteWrap = el(`
    <div class="paste-back">
      <label>${opts.pasteLabel || t("pasteLabel")}</label>
      <textarea placeholder="${escapeHTML(t("pastePlaceholder"))}"></textarea>
      <div class="btn-row"><button type="button" class="btn-primary">${opts.continueLabel || t("continueBtn")}</button></div>
      <div class="parse-error"></div>
    </div>
  `);
  container.appendChild(pasteWrap);

  pasteWrap.querySelector("button").addEventListener("click", () => {
    const val = pasteWrap.querySelector("textarea").value.trim();
    const errEl = pasteWrap.querySelector(".parse-error");
    if (!val) { errEl.textContent = t("pasteEmpty"); return; }
    const ok = onContinue(val);
    if (ok === false) errEl.textContent = t("parseFailed");
  });
}

// ---------- Nav + progress ----------

function renderNav() {
  const nav = document.getElementById("phase-nav");
  const ol = document.createElement("ol");
  PHASES.forEach((id, i) => {
    const li = document.createElement("li");
    li.textContent = t("phase_" + id);
    if (i < state.phase) li.className = "done";
    else if (i === state.phase) li.className = "active";
    ol.appendChild(li);
  });
  nav.innerHTML = "";
  nav.appendChild(ol);

  document.getElementById("phase-label").textContent = `${t("phaseLabel")} ${state.phase + 1} / ${PHASES.length}`;
  document.getElementById("progress-fill").style.width = `${(state.phase / (PHASES.length - 1)) * 100}%`;
}

function goToPhase(i) {
  state.phase = i;
  saveState();
  render();
  window.scrollTo(0, 0);
}

function nextPhase() { goToPhase(Math.min(state.phase + 1, PHASES.length - 1)); }

function render() {
  document.documentElement.lang = state.lang;
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
      <p class="ws-kicker">${t("phaseLabel")} 1 / 8 · ${t("phase_context")}</p>
      <h1 class="ws-h1">AI Workflow Discovery</h1>
      <p class="ws-lead">${t("contextLead")}</p>
    </div>
  `));

  const form = el(`<form id="context-form"></form>`);
  const fields = [
    ["company", t("fCompany"), state.context.company],
    ["website", t("fWebsite"), state.context.website],
    ["industry", t("fIndustry"), state.context.industry],
    ["name", t("fName"), state.context.name],
    ["role", t("fRole"), state.context.role],
    ["department", t("fDepartment"), state.context.department],
  ];
  fields.forEach(([key, label, val]) => {
    form.appendChild(el(`
      <div class="field">
        <label>${label}</label>
        <input name="${key}" type="text" value="${escapeHTML(val)}">
      </div>
    `));
  });
  form.appendChild(el(`
    <div class="field">
      <label>${t("fPainPoints")}</label>
      <textarea name="painPoints">${escapeHTML(state.context.painPoints)}</textarea>
    </div>
  `));
  ws.appendChild(form);

  const modeRow = el(`
    <div class="field">
      <label>${t("fMode")}</label>
      <select name="mode">
        <option value="fast" ${state.mode === "fast" ? "selected" : ""}>${t("modeFast")}</option>
        <option value="deep" ${state.mode === "deep" ? "selected" : ""}>${t("modeDeep")}</option>
      </select>
    </div>
  `);
  ws.appendChild(modeRow);
  modeRow.querySelector("select").addEventListener("change", (e) => {
    state.mode = e.target.value;
    saveState();
    document.getElementById("mode-toggle").textContent = state.mode === "fast" ? t("modeFastShort") : t("modeDeepShort");
  });

  const btnRow = el(`<div class="btn-row">
    <button type="button" id="research-btn" class="btn-ghost">${t("researchBtn")}</button>
    <button type="button" id="start-btn" class="btn-primary">${t("startBtn")}</button>
  </div>`);
  ws.appendChild(btnRow);

  const researchOut = el(`<div id="research-out"></div>`);
  ws.appendChild(researchOut);
  if (state.companyResearch) {
    researchOut.innerHTML = `<div class="ws-callout"><span class="cl-label">${t("research")}</span><p>${escapeHTML(state.companyResearch)}</p></div>`;
  }

  form.querySelectorAll("input, textarea").forEach((input) => {
    input.addEventListener("input", () => { state.context[input.name] = input.value; saveState(); });
  });

  document.getElementById("research-btn").addEventListener("click", () => {
    researchOut.innerHTML = "";
    renderCopyPasteBlock(researchOut, researchPrompt(), (pasted) => {
      state.companyResearch = pasted;
      saveState();
      researchOut.innerHTML = `<div class="ws-callout"><span class="cl-label">${t("research")}</span><p>${escapeHTML(pasted)}</p></div>`;
      return true;
    });
  });

  document.getElementById("start-btn").addEventListener("click", () => nextPhase());
}

function researchPrompt() {
  const c = state.context;
  if (state.lang === "en") {
    return `I'm preparing for an AI workflow discovery workshop. Research this company using web search: ${c.company || "[company]"} (website: ${c.website || "unknown"}, industry: ${c.industry || "unknown"}). Cover: what they do, industry context, typical work processes for a "${c.role || "[role]"}" role, and any known AI initiatives in this industry. Do not invent information — say explicitly what you couldn't find. Keep it under 150 words, cite your sources.`;
  }
  return `Jeg forbereder en AI-discovery-workshop. Undersøk dette selskapet med websøk: ${c.company || "[bedrift]"} (nettside: ${c.website || "ukjent"}, bransje: ${c.industry || "ukjent"}). Dekk: hva de driver med, bransjekontekst, typiske arbeidsprosesser for rollen "${c.role || "[rolle]"}", og eventuelle kjente AI-initiativer i bransjen. Ikke finn på informasjon — si eksplisitt hva du ikke fant. Maks 150 ord, oppgi kildene dine.`;
}

// ============================================================
// Phase 1 — Workflow (list → interview prompt → workflow map)
// ============================================================

function renderWorkflow(ws) {
  if (state.workflowSub === "list") return renderWorkflowList(ws);
  if (state.workflowSub === "interview") return renderInterviewStep(ws);
  return renderWorkflowMap(ws);
}

function renderWorkflowList(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">${t("phaseLabel")} 2 / 8 · ${t("workflowKicker")}</p>
      <h1 class="ws-h1">${t("workflowH1")}</h1>
      <p class="ws-lead">${t("workflowLead")}${state.context.role ? " " + escapeHTML(state.context.role) + "." : ""}</p>
    </div>
  `));
  const box = el(`
    <div class="field" style="max-width:640px">
      <label>${t("workflowFieldLabel")}</label>
      <textarea id="activities" rows="10" placeholder="${escapeHTML(t("workflowPlaceholder"))}">${escapeHTML(state.workflowActivities.join("\n"))}</textarea>
    </div>
  `);
  ws.appendChild(box);
  ws.appendChild(el(`<div class="btn-row"><button type="button" id="to-interview" class="btn-primary">${t("interviewBtn")}</button></div>`));

  document.getElementById("to-interview").addEventListener("click", () => {
    const lines = document.getElementById("activities").value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { alert(t("needOneActivity")); return; }
    state.workflowActivities = lines;
    state.workflowSub = "interview";
    saveState();
    render();
  });
}

function interviewPrompt() {
  const c = state.context;
  const n = state.mode === "fast" ? "6–8" : "10–14";
  if (state.lang === "en") {
    return `You are a sharp, curious, practical AI consultant interviewing me about my work, ahead of an AI discovery workshop. My role: ${c.role || "[role]"}, department: ${c.department || "[dept]"}, company: ${c.company || "[company]"}.
Recurring tasks I do: ${state.workflowActivities.join("; ")}.

Interview me about ONE of these tasks at a time. Ask ONE question at a time, short and concrete (max 2 sentences), and wait for my answer before the next question. Cover over the course of the interview: exactly what happens step by step, how often, how long it takes, what information is needed and where it comes from, what's difficult, which parts require judgement vs. are repetitive, where I search for information, and what causes rework. Don't suggest AI solutions yet — just understand the work. Ask around ${n} questions total.

When we're done, output ONLY a JSON array (no other text) describing the workflow as 4–7 ordered steps, each shaped like:
{"label": "short phase name e.g. Input/Search/Analyse/Judgement/Output", "title": "concrete description", "time": "time estimate", "frequency": "how often", "tools": "tools/systems used", "painPoints": "brief note on what's hard"}

Start by asking your first question now.`;
  }
  return `Du er en skarp, nysgjerrig, praktisk AI-konsulent som intervjuer meg om arbeidet mitt, i forkant av en AI-discovery-workshop. Min rolle: ${c.role || "[rolle]"}, avdeling: ${c.department || "[avdeling]"}, bedrift: ${c.company || "[bedrift]"}.
Tilbakevendende oppgaver jeg gjør: ${state.workflowActivities.join("; ")}.

Intervju meg om ÉN av disse oppgavene om gangen. Still ETT spørsmål om gangen, kort og konkret (maks 2 setninger), og vent på svaret mitt før neste spørsmål. Dekk i løpet av intervjuet: nøyaktig hva som skjer steg for steg, hvor ofte, hvor lang tid det tar, hvilken informasjon som trengs og hvor den kommer fra, hva som er vanskelig, hvilke deler krever skjønn vs. er repetitive, hvor jeg søker informasjon, og hva som forårsaker "rework". Ikke foreslå AI-løsninger ennå — bare forstå arbeidet. Still rundt ${n} spørsmål totalt.

Når vi er ferdige, skriv KUN ut en JSON-liste (ingen annen tekst) som beskriver arbeidsflyten som 4–7 steg i rekkefølge, hver formet slik:
{"label": "kort fasenavn f.eks. Input/Søk/Analyse/Vurdering/Output", "title": "konkret beskrivelse", "time": "tidsestimat", "frequency": "hvor ofte", "tools": "verktøy/systemer brukt", "painPoints": "kort om hva som er vanskelig"}

Start med å stille det første spørsmålet ditt nå.`;
}

function renderInterviewStep(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">${t("phaseLabel")} 2 / 8 · ${t("interviewKicker")}</p>
      <h1 class="ws-h1">${t("interviewH1")}</h1>
      <p class="ws-lead">${t("interviewLead")}</p>
    </div>
  `));

  renderCopyPasteBlock(ws, interviewPrompt(), (pasted) => {
    const parsed = extractJSON(pasted);
    if (!Array.isArray(parsed)) return false;
    state.workflowMap = parsed;
    state.workflowSub = "map";
    saveState();
    render();
    return true;
  }, { pasteLabel: t("pasteJsonLabel"), continueLabel: t("buildMapBtn") });

  ws.appendChild(el(`<div class="btn-row"><button type="button" id="back-to-list" class="btn-ghost">${t("backBtn")}</button></div>`));
  document.getElementById("back-to-list").addEventListener("click", () => { state.workflowSub = "list"; saveState(); render(); });
}

function renderWorkflowMap(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">${t("phaseLabel")} 2 / 8 · ${t("mapKicker")}</p>
      <h1 class="ws-h1">${t("mapH1")}</h1>
      <p class="ws-lead">${t("mapLead")}</p>
    </div>
  `));
  const flow = el(`<div class="node-flow"></div>`);
  (state.workflowMap || []).forEach((node, i) => {
    flow.appendChild(el(`
      <div class="node-box">
        <div class="node-label">${escapeHTML(node.label || "")}</div>
        <div class="node-title">${escapeHTML(node.title || "")}</div>
        <div class="node-meta">${escapeHTML(node.time || "")}${node.frequency ? " · " + escapeHTML(node.frequency) : ""}${node.tools ? " · " + escapeHTML(node.tools) : ""}</div>
        ${node.painPoints ? `<div class="node-meta" style="margin-top:6px;color:#b45;">⚠ ${escapeHTML(node.painPoints)}</div>` : ""}
      </div>
    `));
    if (i < state.workflowMap.length - 1) flow.appendChild(el(`<div class="node-arrow">↓</div>`));
  });
  ws.appendChild(flow);
  ws.appendChild(el(`<div class="btn-row">
    <button type="button" id="redo-interview" class="btn-ghost">${t("redoBtn")}</button>
    <button type="button" id="to-opportunities" class="btn-primary">${t("findOppBtn")}</button>
  </div>`));
  document.getElementById("redo-interview").addEventListener("click", () => { state.workflowSub = "interview"; saveState(); render(); });
  document.getElementById("to-opportunities").addEventListener("click", () => nextPhase());
}

// ============================================================
// Phase 2 — Opportunities
// ============================================================

function opportunitiesPrompt() {
  const workflowJson = JSON.stringify(state.workflowMap);
  if (state.lang === "en") {
    return `Based on this workflow, generate 6–9 possible improvements. Do NOT assume AI is always the right answer: consider three categories — AI, Automation/regular software, and Process improvement.

For each, output an object: {"id": "short unique string", "cluster": "theme group e.g. Information search / Reporting / Analysis", "opportunityType": "AI"|"Automation"|"Process", "title": "short title", "problem": "problem description", "whyHelp": "why this might help", "alternative": "a concrete non-AI alternative", "challenge": "a critical counter-check — why this might NOT work, hidden assumptions, what would need verifying, and whether AI is actually necessary"}.

Role: ${state.context.role}. Workflow: ${workflowJson}

Reply with ONLY a valid JSON array, nothing else.`;
  }
  return `Basert på denne arbeidsflyten, generer 6–9 mulige forbedringer. IKKE anta at AI alltid er riktig løsning: vurder tre kategorier — AI, Automatisering/vanlig programvare, og Prosessforbedring.

For hver, gi et objekt: {"id": "kort unik streng", "cluster": "tema-gruppe f.eks. Informasjonssøk / Rapportering / Analyse", "opportunityType": "AI"|"Automation"|"Process", "title": "kort tittel", "problem": "problembeskrivelse", "whyHelp": "hvorfor dette kan hjelpe", "alternative": "et konkret ikke-AI-alternativ", "challenge": "en kritisk motsjekk — hvorfor dette KANSKJE ikke fungerer, skjulte antagelser, hva som må verifiseres, og om AI faktisk er nødvendig"}.

Rolle: ${state.context.role}. Arbeidsflyt: ${workflowJson}

Svar KUN med en gyldig JSON-liste, ingenting annet, på norsk.`;
}

function renderOpportunities(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">${t("phaseLabel")} 3 / 8 · ${t("oppKicker")}</p>
      <h1 class="ws-h1">${t("oppH1")}</h1>
      <p class="ws-lead">${t("oppLead")}</p>
    </div>
  `));

  if (state.opportunities.length === 0) {
    renderCopyPasteBlock(ws, opportunitiesPrompt(), (pasted) => {
      const parsed = extractJSON(pasted);
      if (!Array.isArray(parsed)) return false;
      state.opportunities = parsed;
      saveState();
      render();
      return true;
    });
    return;
  }

  const grid = el(`<div class="card-grid"></div>`);
  state.opportunities.forEach((o) => {
    const card = el(`
      <div class="opp-card">
        <span class="opp-cluster">${escapeHTML(o.cluster || "")}</span>
        <span class="badge b-${(o.opportunityType || "ai").toLowerCase()}">${escapeHTML(o.opportunityType || "AI")}</span>
        <h4>${escapeHTML(o.title)}</h4>
        <p><strong>${t("lblProblem")}:</strong> ${escapeHTML(o.problem)}</p>
        <p><strong>${t("lblWhy")}:</strong> ${escapeHTML(o.whyHelp)}</p>
        <p><strong>${t("lblAlternative")}:</strong> ${escapeHTML(o.alternative)}</p>
        ${o.challenge ? `<div class="ws-callout"><span class="cl-label">${t("lblChallenge")}</span><p>${escapeHTML(o.challenge)}</p></div>` : ""}
        <label style="display:flex; gap:8px; align-items:center; font-size:13px; margin-top:10px;">
          <input type="radio" name="opp-select" value="${o.id}" ${state.selectedOpportunityId === o.id ? "checked" : ""}> ${t("selectForPriority")}
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
    <button type="button" id="regen-opp" class="btn-ghost">${t("regenBtn")}</button>
    <button type="button" id="to-prioritize" class="btn-primary">${t("toPrioritizeBtn")}</button>
  </div>`));
  document.getElementById("regen-opp").addEventListener("click", () => { state.opportunities = []; saveState(); render(); });
  document.getElementById("to-prioritize").addEventListener("click", () => nextPhase());
}

// ============================================================
// Phase 3 — Prioritize
// ============================================================

function scoreDims() {
  return state.lang === "en"
    ? [["impact", "Impact"], ["frequency", "Frequency"], ["timeSaved", "Time saved"], ["feasibility", "Feasibility"], ["data", "Data readiness"], ["risk", "Risk"], ["timeToValue", "Time to value"]]
    : [["impact", "Impact"], ["frequency", "Frekvens"], ["timeSaved", "Tidsbesparelse"], ["feasibility", "Gjennomførbarhet"], ["data", "Dataklarhet"], ["risk", "Risiko"], ["timeToValue", "Tid til verdi"]];
}

function renderPrioritize(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">${t("phaseLabel")} 4 / 8 · ${t("prioKicker")}</p>
      <h1 class="ws-h1">${t("prioH1")}</h1>
      <p class="ws-lead">${t("prioLead")}</p>
    </div>
  `));

  if (state.opportunities.length === 0) {
    ws.appendChild(el(`<p>${t("noOpportunitiesYet")}</p>`));
    return;
  }

  const dims = scoreDims();
  const table = el(`<table class="scorecard"><thead><tr><th>${t("useCase")}</th>${dims.map(([, l]) => `<th>${l}</th>`).join("")}<th>${t("score")}</th></tr></thead><tbody></tbody></table>`);
  const tbody = table.querySelector("tbody");
  state.opportunities.forEach((o) => {
    o.scores = o.scores || {};
    const row = el(`<tr><td>${escapeHTML(o.title)}</td></tr>`);
    dims.forEach(([key]) => {
      row.appendChild(el(`<td><input type="number" min="0" max="5" data-opp="${o.id}" data-dim="${key}" value="${o.scores[key] ?? ""}"></td>`));
    });
    row.appendChild(el(`<td class="sc-score" id="score-${o.id}">${computeScore(o)}</td>`));
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
      <label>${t("pickUseCase")}</label>
      <select id="pick-opp">
        <option value="">${t("pickPlaceholder")}</option>
        ${state.opportunities.map((o) => `<option value="${o.id}" ${state.selectedOpportunityId === o.id ? "selected" : ""}>${escapeHTML(o.title)}</option>`).join("")}
      </select>
    </div>
  `);
  ws.appendChild(selectField);
  selectField.querySelector("select").addEventListener("change", (e) => { state.selectedOpportunityId = e.target.value; saveState(); });

  ws.appendChild(el(`<div class="btn-row"><button type="button" id="to-deepdive" class="btn-primary">${t("toDeepDiveBtn")}</button></div>`));
  document.getElementById("to-deepdive").addEventListener("click", () => {
    if (!state.selectedOpportunityId) { alert(t("pickOneFirst")); return; }
    nextPhase();
  });
}

function computeScore(o) {
  const s = o.scores || {};
  return scoreDims().map(([k]) => s[k] || 0).reduce((a, b) => a + b, 0);
}

function renderMatrix() {
  const wrap = document.getElementById("matrix-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";
  const matrix = el(`
    <div class="matrix">
      <span class="matrix-label top-left">${t("matrixStrategic")}</span>
      <span class="matrix-label top-right">${t("matrixQuickWins")}</span>
      <span class="matrix-label bottom-left">${t("matrixLowPriority")}</span>
      <span class="matrix-label bottom-right">${t("matrixLowHanging")}</span>
      <span class="matrix-axis-y">${t("matrixImpactAxis")}</span>
      <span class="matrix-axis-x">${t("matrixFeasAxis")}</span>
    </div>
  `);
  state.opportunities.forEach((o) => {
    const s = o.scores || {};
    const impact = ((s.impact || 0) + (s.timeSaved || 0)) / 2 / 5;
    const feas = ((s.feasibility || 0) + (s.data || 0)) / 2 / 5;
    matrix.appendChild(el(`<div class="matrix-dot" style="left:${feas * 100}%; bottom:${impact * 100}%;" title="${escapeHTML(o.title)}"></div>`));
  });
  wrap.appendChild(matrix);
}

// ============================================================
// Phase 4 — Deep Dive
// ============================================================

function deepDiveQuestions() {
  return state.lang === "en"
    ? [["currentState", "How is this done today?"], ["people", "Who is involved?"], ["systems", "Which systems are involved?"], ["data", "What information is required?"], ["inputs", "What goes into the process?"], ["outputs", "What should come out?"], ["exceptions", "When does the normal process fail?"], ["judgement", "Where is human judgement required?"], ["risks", "What could go wrong?"], ["success", "What would a much better process look like?"]]
    : [["currentState", "Hvordan gjøres dette i dag?"], ["people", "Hvem er involvert?"], ["systems", "Hvilke systemer er involvert?"], ["data", "Hvilken informasjon kreves?"], ["inputs", "Hva går inn i prosessen?"], ["outputs", "Hva skal komme ut?"], ["exceptions", "Når feiler den normale prosessen?"], ["judgement", "Hvor kreves menneskelig skjønn?"], ["risks", "Hva kan gå galt?"], ["success", "Hvordan ser en mye bedre prosess ut?"]];
}

function renderDeepDive(ws) {
  const opp = state.opportunities.find((o) => o.id === state.selectedOpportunityId);
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">${t("phaseLabel")} 5 / 8 · ${t("ddKicker")}</p>
      <h1 class="ws-h1">${t("ddH1")} ${escapeHTML(opp ? opp.title : "")}</h1>
      <p class="ws-lead">${t("ddLead")}</p>
    </div>
  `));

  const list = el(`<div class="qa-list"></div>`);
  deepDiveQuestions().forEach(([key, q]) => {
    list.appendChild(el(`
      <div class="qa-item">
        <div class="qa-q">${q}</div>
        <textarea data-key="${key}">${escapeHTML(state.deepDiveAnswers[key] || "")}</textarea>
      </div>
    `));
  });
  ws.appendChild(list);
  list.querySelectorAll("textarea").forEach((tx) => {
    tx.addEventListener("input", () => { state.deepDiveAnswers[tx.dataset.key] = tx.value; saveState(); });
  });

  ws.appendChild(el(`<div class="btn-row"><button type="button" id="to-solutions" class="btn-primary">${t("toSolutionsBtn")}</button></div>`));
  document.getElementById("to-solutions").addEventListener("click", () => nextPhase());
}

// ============================================================
// Phase 5 — Solutions
// ============================================================

function solutionsPrompt() {
  const opp = state.opportunities.find((o) => o.id === state.selectedOpportunityId);
  if (state.lang === "en") {
    return `Generate 3–4 solution options (label A, B, C, optionally D) for the problem below, including at least one traditional/non-AI option where relevant.

For each: {"label":"A", "name": "short name", "architecture": "brief description of how it's built", "inputs":"", "processing":"", "output":"", "humanInLoop": "where humans must approve/check", "systems": "systems required", "data": "data required", "complexity":"low/medium/high", "risks":"", "effort": "rough estimate", "benefit": "expected benefit"}.

Use case: ${opp ? opp.title + " — " + opp.problem : ""}. Deep dive notes: ${JSON.stringify(state.deepDiveAnswers)}

Reply with ONLY a valid JSON array, nothing else.`;
  }
  return `Generer 3–4 løsningsalternativer (merk A, B, C, valgfritt D) for problemet under, inkludert minst ett tradisjonelt/ikke-AI-alternativ der relevant.

For hver: {"label":"A", "name": "kort navn", "architecture": "kort beskrivelse av oppbygning", "inputs":"", "processing":"", "output":"", "humanInLoop": "hvor mennesker må godkjenne/sjekke", "systems": "nødvendige systemer", "data": "nødvendig data", "complexity":"lav/middels/høy", "risks":"", "effort": "grovt anslag", "benefit": "forventet gevinst"}.

Use case: ${opp ? opp.title + " — " + opp.problem : ""}. Deep dive-notater: ${JSON.stringify(state.deepDiveAnswers)}

Svar KUN med en gyldig JSON-liste, ingenting annet, på norsk.`;
}

function challengePrompt(sol) {
  if (state.lang === "en") {
    return `Assume the proposed solution below is wrong. Try to disprove it. Identify hidden assumptions, technical limitations, data problems, security concerns, workflow issues, adoption barriers, and situations where the solution would fail. Suggest better alternatives if relevant. Keep it under 120 words, concrete. Don't fabricate domain expertise you don't have — say explicitly where domain experts must validate technical details.

Solution: ${JSON.stringify(sol)}`;
  }
  return `Anta at den foreslåtte løsningen under er feil. Prøv å motbevise den. Identifiser skjulte antagelser, tekniske begrensninger, dataproblemer, sikkerhetsbekymringer, arbeidsflyt-problemer, adopsjonsbarrierer, og situasjoner hvor løsningen ville feilet. Foreslå bedre alternativer hvis relevant. Maks 120 ord, konkret. Ikke fabrikker fagkompetanse du ikke har — si eksplisitt hvor fagfolk må validere tekniske detaljer.

Løsning: ${JSON.stringify(sol)}`;
}

function renderSolutions(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">${t("phaseLabel")} 6 / 8 · ${t("solKicker")}</p>
      <h1 class="ws-h1">${t("solH1")}</h1>
      <p class="ws-lead">${t("solLead")}</p>
    </div>
  `));

  if (state.solutions.length === 0) {
    renderCopyPasteBlock(ws, solutionsPrompt(), (pasted) => {
      const parsed = extractJSON(pasted);
      if (!Array.isArray(parsed)) return false;
      state.solutions = parsed;
      saveState();
      render();
      return true;
    });
    return;
  }

  const grid = el(`<div class="card-grid"></div>`);
  state.solutions.forEach((s) => {
    const card = el(`
      <div class="opp-card">
        <span class="opp-cluster">${t("solutionLabel")} ${escapeHTML(s.label)}</span>
        <h4>${escapeHTML(s.name)}</h4>
        <p><strong>${t("lblArchitecture")}:</strong> ${escapeHTML(s.architecture)}</p>
        <p><strong>${t("lblHumanInLoop")}:</strong> ${escapeHTML(s.humanInLoop)}</p>
        <p><strong>${t("lblComplexity")}:</strong> ${escapeHTML(s.complexity)} · <strong>${t("lblEffort")}:</strong> ${escapeHTML(s.effort)}</p>
        <p><strong>${t("lblBenefit")}:</strong> ${escapeHTML(s.benefit)}</p>
        ${s.challengeResult ? `<div class="ws-callout"><span class="cl-label">${t("lblChallengeResult")}</span><p>${escapeHTML(s.challengeResult)}</p></div>` : ""}
        <div class="challenge-slot"></div>
        <label style="display:flex; gap:8px; align-items:center; font-size:13px; margin-top:10px;">
          <input type="radio" name="sol-select" value="${s.label}" ${state.selectedSolutionLabel === s.label ? "checked" : ""}> ${t("selectThis")}
        </label>
      </div>
    `);
    if (!s.challengeResult) {
      const slot = card.querySelector(".challenge-slot");
      const btn = el(`<button type="button" class="btn-ghost">${t("challengeBtn")}</button>`);
      slot.appendChild(btn);
      btn.addEventListener("click", () => {
        slot.innerHTML = "";
        renderCopyPasteBlock(slot, challengePrompt(s), (pasted) => {
          s.challengeResult = pasted;
          saveState();
          render();
          return true;
        });
      });
    }
    grid.appendChild(card);
  });
  ws.appendChild(grid);

  grid.querySelectorAll('input[name="sol-select"]').forEach((r) => {
    r.addEventListener("change", (e) => { state.selectedSolutionLabel = e.target.value; saveState(); });
  });

  ws.appendChild(el(`<div class="btn-row"><button type="button" id="to-pilot" class="btn-primary">${t("toPilotBtn")}</button></div>`));
  document.getElementById("to-pilot").addEventListener("click", () => {
    if (!state.selectedSolutionLabel) { alert(t("pickSolutionFirst")); return; }
    nextPhase();
  });
}

// ============================================================
// Phase 6 — Pilot design
// ============================================================

function pilotFields() {
  return state.lang === "en"
    ? [["problem", "Problem", "What exactly are we solving?"], ["currentProcess", "Current process", "How does it work today?"], ["proposedSolution", "Proposed solution", "What will we build/test?"], ["users", "Users", "Who will use it?"], ["inputs", "Inputs", "What information does it need?"], ["outputs", "Outputs", "What should it produce?"], ["humanControl", "Human control", "Where must humans approve/check?"], ["systems", "Systems", "What systems does it need to interact with?"], ["data", "Data", "What data is needed?"], ["security", "Security", "What information must be protected?"], ["successMetric", "Success metric", "How will we know the pilot works?"], ["scope", "Pilot scope", "What is deliberately NOT included?"]]
    : [["problem", "Problem", "Hva løser vi egentlig?"], ["currentProcess", "Nåværende prosess", "Hvordan fungerer det i dag?"], ["proposedSolution", "Foreslått løsning", "Hva skal vi bygge/teste?"], ["users", "Brukere", "Hvem skal bruke det?"], ["inputs", "Input", "Hvilken informasjon trenger den?"], ["outputs", "Output", "Hva skal den produsere?"], ["humanControl", "Menneskelig kontroll", "Hvor må mennesker godkjenne/sjekke?"], ["systems", "Systemer", "Hvilke systemer må den snakke med?"], ["data", "Data", "Hvilke data trengs?"], ["security", "Sikkerhet", "Hvilken informasjon må beskyttes?"], ["successMetric", "Suksesskriterium", "Hvordan vet vi at piloten fungerer?"], ["scope", "Pilotomfang", "Hva er bevisst IKKE inkludert?"]];
}

function pilotDraftPrompt() {
  const opp = state.opportunities.find((o) => o.id === state.selectedOpportunityId);
  const sol = state.solutions.find((s) => s.label === state.selectedSolutionLabel);
  if (state.lang === "en") {
    return `Draft a pilot design as a JSON object with the keys: problem, currentProcess, proposedSolution, users, inputs, outputs, humanControl, systems, data, security, successMetric, scope. Base it on the information below. Be concrete and brief per field (1–3 sentences).

Use case: ${JSON.stringify(opp)}. Deep dive: ${JSON.stringify(state.deepDiveAnswers)}. Chosen solution: ${JSON.stringify(sol)}.

Reply with ONLY valid JSON, nothing else.`;
  }
  return `Lag et utkast til pilotdesign som et JSON-objekt med nøklene: problem, currentProcess, proposedSolution, users, inputs, outputs, humanControl, systems, data, security, successMetric, scope. Basér deg på informasjonen under. Vær konkret og kort per felt (1–3 setninger).

Use case: ${JSON.stringify(opp)}. Deep dive: ${JSON.stringify(state.deepDiveAnswers)}. Valgt løsning: ${JSON.stringify(sol)}.

Svar KUN med gyldig JSON, ingenting annet, på norsk.`;
}

function renderPilot(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">${t("phaseLabel")} 7 / 8 · ${t("pilotKicker")}</p>
      <h1 class="ws-h1">${t("pilotH1")}</h1>
      <p class="ws-lead">${t("pilotLead")}</p>
    </div>
  `));

  ws.appendChild(el(`<button type="button" id="draft-pilot" class="btn-ghost" style="margin-bottom:20px;">${t("draftBtn")}</button>`));
  const draftSlot = el(`<div id="draft-slot"></div>`);
  ws.appendChild(draftSlot);

  const list = el(`<div class="qa-list"></div>`);
  pilotFields().forEach(([key, label, hint]) => {
    list.appendChild(el(`
      <div class="qa-item">
        <div class="qa-q">${label}</div>
        <p class="field-hint" style="margin-bottom:6px;">${hint}</p>
        <textarea data-key="${key}">${escapeHTML(state.pilot[key] || "")}</textarea>
      </div>
    `));
  });
  ws.appendChild(list);
  list.querySelectorAll("textarea").forEach((tx) => {
    tx.addEventListener("input", () => { state.pilot[tx.dataset.key] = tx.value; saveState(); });
  });

  ws.appendChild(el(`<div class="btn-row"><button type="button" id="to-brief" class="btn-primary">${t("toBriefBtn")}</button></div>`));

  document.getElementById("draft-pilot").addEventListener("click", () => {
    draftSlot.innerHTML = "";
    renderCopyPasteBlock(draftSlot, pilotDraftPrompt(), (pasted) => {
      const parsed = extractJSON(pasted);
      if (!parsed) return false;
      state.pilot = Object.assign({}, state.pilot, parsed);
      saveState();
      render();
      return true;
    });
  });
  document.getElementById("to-brief").addEventListener("click", () => nextPhase());
}

// ============================================================
// Phase 7 — Final brief
// ============================================================

function briefPrompt() {
  const opp = state.opportunities.find((o) => o.id === state.selectedOpportunityId);
  const sol = state.solutions.find((s) => s.label === state.selectedSolutionLabel);
  if (state.lang === "en") {
    return `Write a professional "AI Pilot Brief" in Markdown, with exactly these sections as ## headings: Company, Department, Role, 1. Problem, 2. Current workflow, 3. Identified opportunity, 4. Why it matters, 5. Proposed solution, 6. Alternative solutions considered, 7. Data required, 8. Systems involved, 9. Human involvement, 10. Risks/unknowns, 11. Pilot scope, 12. Success criteria, 13. Estimated effort, 14. Recommended next step, 15. Pilot owner.
It should read like a consulting document, not an AI-generated report: concrete, brief per section, no filler.

Context: ${JSON.stringify(state.context)}. Chosen use case: ${JSON.stringify(opp)}. Deep dive: ${JSON.stringify(state.deepDiveAnswers)}. Chosen solution: ${JSON.stringify(sol)}. Pilot design: ${JSON.stringify(state.pilot)}.`;
  }
  return `Skriv en profesjonell "AI Pilot Brief" i Markdown, på norsk, med nøyaktig disse seksjonene som ## overskrifter: Selskap, Avdeling, Rolle, 1. Problem, 2. Nåværende arbeidsflyt, 3. Identifisert mulighet, 4. Hvorfor det er viktig, 5. Foreslått løsning, 6. Alternative løsninger vurdert, 7. Nødvendig data, 8. Involverte systemer, 9. Menneskelig involvering, 10. Risiko/ukjente faktorer, 11. Pilotomfang, 12. Suksesskriterier, 13. Estimert innsats, 14. Anbefalt neste steg, 15. Pilot-eier.
Skal lese som et konsulentdokument, ikke en AI-generert rapport: konkret, kort per seksjon, ingen fyllord.

Kontekst: ${JSON.stringify(state.context)}. Valgt use case: ${JSON.stringify(opp)}. Deep dive: ${JSON.stringify(state.deepDiveAnswers)}. Valgt løsning: ${JSON.stringify(sol)}. Pilotdesign: ${JSON.stringify(state.pilot)}.`;
}

function renderBrief(ws) {
  ws.appendChild(el(`
    <div>
      <p class="ws-kicker">${t("phaseLabel")} 8 / 8 · ${t("briefKicker")}</p>
      <h1 class="ws-h1">${t("briefH1")}</h1>
    </div>
  `));

  if (!state.briefText) {
    renderCopyPasteBlock(ws, briefPrompt(), (pasted) => {
      state.briefText = pasted;
      saveState();
      render();
      return true;
    }, { pasteLabel: t("pasteBriefLabel"), continueLabel: t("showBriefBtn") });
    return;
  }

  const doc = el(`<div class="brief-doc" id="brief-doc"></div>`);
  doc.innerHTML = briefToHTML(state.briefText);
  ws.appendChild(doc);

  ws.appendChild(el(`<div class="btn-row">
    <button type="button" id="regen-brief" class="btn-ghost">${t("regenBriefBtn")}</button>
    <button type="button" id="copy-brief" class="btn-ghost">${t("copyBriefBtn")}</button>
    <button type="button" id="md-brief" class="btn-ghost">${t("mdBriefBtn")}</button>
    <button type="button" id="pdf-brief" class="btn-primary">${t("pdfBriefBtn")}</button>
  </div>`));

  document.getElementById("regen-brief").addEventListener("click", () => { state.briefText = ""; saveState(); render(); });
  document.getElementById("copy-brief").addEventListener("click", () => {
    navigator.clipboard.writeText(state.briefText).then(() => alert(t("copiedAlert")));
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
      <h2 style="margin-top:48px;">${t("ctaHeading")}</h2>
      <div class="cta-options">
        <div class="cta-option">
          <h4>${t("ctaInternalTitle")}</h4>
          <p>${t("ctaInternalBody")} <a href="${state.lang === "en" ? "../ai-tips-for-engineers/" : "../ai-tips-for-ingeniorer/"}" target="_blank" rel="noopener">${t("ctaInternalLink")}</a></p>
        </div>
        <div class="cta-option highlight">
          <h4>${t("ctaYcpTitle")}</h4>
          <p>${t("ctaYcpBody")}</p>
          <a href="mailto:kontakt@ycpconsulting.no" class="btn-primary" style="text-decoration:none;">${t("ctaYcpBtn")}</a>
        </div>
      </div>
    </div>
  `);
  ws.appendChild(cta);
}

function briefToHTML(md) {
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (inList) { html += "</ul>"; inList = false; } continue; }
    if (line.startsWith("## ") || line.startsWith("# ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h2>${escapeHTML(line.replace(/^#+\s*/, ""))}</h2>`;
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

// ============================================================
// Strings (NO / EN)
// ============================================================

const T = {
  no: {
    phase_context: "Context", phase_workflow: "Workflow", phase_opportunities: "Opportunities",
    phase_prioritize: "Prioritize", phase_deepdive: "Deep Dive", phase_solutions: "Solutions",
    phase_pilot: "Pilot", phase_brief: "Brief",
    phaseLabel: "Fase",
    contextLead: "Ikke en presentasjon om AI. Dere bruker AI til å analysere egen arbeidshverdag, finne muligheter, og designe én konkret pilot.",
    fCompany: "Bedrift", fWebsite: "Nettside", fIndustry: "Bransje", fName: "Ditt navn",
    fRole: "Din rolle (f.eks. Drilling Engineer, HR Advisor)", fDepartment: "Avdeling",
    fPainPoints: "Hva er 2–3 ting du bruker mye tid på? (valgfritt)", fMode: "Kjøremodus",
    modeFast: "Fast mode — 60 min", modeDeep: "Deep mode — 90 min",
    modeFastShort: "Fast mode", modeDeepShort: "Deep mode",
    researchBtn: "Research bedriften (valgfritt) →", startBtn: "START DISCOVERY →", research: "Research",
    csStep1: "Kopier prompten under.", csStep2: "Lim den inn i din egen Claude-samtale (claude.ai).",
    csStep3: "Lim svaret fra Claude inn i feltet under, og fortsett.",
    copyPrompt: "Kopier prompten", copied: "✓ Kopiert", pasteLabel: "Lim inn svaret fra Claude",
    pastePlaceholder: "Lim inn her...", continueBtn: "Fortsett →", pasteEmpty: "Lim inn svaret først.",
    parseFailed: "Fikk ikke lest svaret som forventet format. Sjekk at du limte inn hele svaret, og prøv igjen.",
    workflowKicker: "Workflow discovery", workflowH1: "Hva gjør du i løpet av en normal arbeidsuke?",
    workflowLead: "Skriv ned 5–10 tilbakevendende oppgaver du gjør som",
    workflowFieldLabel: "Én oppgave per linje",
    workflowPlaceholder: "F.eks.\nPrepare drilling reports\nReview offset well data\nAnalyse drilling parameters",
    interviewBtn: "LA CLAUDE INTERVJUE DEG →", needOneActivity: "Skriv ned minst én oppgave.",
    interviewKicker: "AI-intervju", interviewH1: "Fortell om arbeidsflyten din",
    interviewLead: "Ha hele intervjuet i din egen Claude-samtale. Når Claude gir deg en avsluttende JSON-oppsummering, lim den inn under.",
    pasteJsonLabel: "Lim inn JSON-arbeidsflyten fra Claude", buildMapBtn: "Bygg kartet →",
    backBtn: "← Tilbake til oppgavelisten",
    mapKicker: "Arbeidsflyt-kart", mapH1: "Slik ser arbeidsflyten ut",
    mapLead: "Sjekk at dette stemmer før dere går videre til å lete etter muligheter.",
    redoBtn: "Tilbake til intervjuet", findOppBtn: "Finn AI-muligheter →",
    oppKicker: "AI Opportunity Discovery", oppH1: "Hvor kan denne arbeidsflyten forbedres?",
    oppLead: "Vurder tre typer løsning for hvert steg: AI, automatisering/vanlig programvare, og prosessforbedring — ikke bare AI.",
    lblProblem: "Problem", lblWhy: "Hvorfor", lblAlternative: "Alternativ", lblChallenge: "Kritisk motsjekk",
    selectForPriority: "Velg denne til prioritering", regenBtn: "Generer flere", toPrioritizeBtn: "TIL PRIORITERING →",
    prioKicker: "Prioritering", prioH1: "Velg det beste problemet, ikke bare den kuleste ideen",
    prioLead: "Score hver mulighet 0–5 på hver dimensjon. Totalscoren er et hjelpemiddel, ikke en fasit.",
    noOpportunitiesYet: "Ingen muligheter generert ennå. Gå tilbake til forrige fase.",
    useCase: "Use case", score: "Score",
    pickUseCase: "Valgt use case for deep dive", pickPlaceholder: "— velg —",
    toDeepDiveBtn: "DEEP DIVE PÅ VALGT USE CASE →", pickOneFirst: "Velg en use case først.",
    matrixStrategic: "Strategic", matrixQuickWins: "Quick wins", matrixLowPriority: "Low priority",
    matrixLowHanging: "Low-hanging fruit", matrixImpactAxis: "Impact →", matrixFeasAxis: "Feasibility →",
    ddKicker: "Deep Dive", ddH1: "Nå undersøker dere:",
    ddLead: "Forstå problemet ordentlig før dere designer løsningen. Fyll ut det dere vet.",
    toSolutionsBtn: "UTFORSK LØSNINGER →",
    solKicker: "Solution Exploration", solH1: "Ikke bli forelsket i den første løsningen",
    solLead: "Bruk «Challenge this solution» på favoritten før dere velger.",
    solutionLabel: "Løsning", lblArchitecture: "Arkitektur", lblHumanInLoop: "Human-in-the-loop",
    lblComplexity: "Kompleksitet", lblEffort: "Innsats", lblBenefit: "Forventet gevinst",
    lblChallengeResult: "Kritisk utfordring", challengeBtn: "CHALLENGE THIS SOLUTION",
    selectThis: "Velg denne", toPilotBtn: "DESIGN PILOTEN →", pickSolutionFirst: "Velg en løsning først.",
    pilotKicker: "Pilot Design", pilotH1: "Gjør ideen om til en pilot",
    pilotLead: "Fyll ut selv, eller la Claude foreslå et førsteutkast.",
    draftBtn: "La Claude foreslå et utkast →", toBriefBtn: "GENERER PILOT BRIEF →",
    briefKicker: "Pilot Brief", briefH1: "Dette er det dere går ut av rommet med",
    pasteBriefLabel: "Lim inn pilot brief-en fra Claude", showBriefBtn: "Vis brief →",
    regenBriefBtn: "Generer på nytt", copyBriefBtn: "Kopier til utklippstavle",
    mdBriefBtn: "Last ned som Markdown", pdfBriefBtn: "Skriv ut / lagre som PDF", copiedAlert: "Kopiert.",
    ctaHeading: "Dere har identifisert en mulighet. Nå må dere teste om den faktisk fungerer.",
    ctaInternalTitle: "Explore internally", ctaInternalBody: "Ta med pilotbrief-en og diskuter den internt. Se også",
    ctaInternalLink: "AI-verktøykassen for ingeniører",
    ctaYcpTitle: "Build a pilot with YCP", ctaYcpBody: "Vi hjelper dere å gjøre det valgte use-caset om til en fungerende prototype.",
    ctaYcpBtn: "DISCUSS THE PILOT →",
  },
  en: {
    phase_context: "Context", phase_workflow: "Workflow", phase_opportunities: "Opportunities",
    phase_prioritize: "Prioritize", phase_deepdive: "Deep Dive", phase_solutions: "Solutions",
    phase_pilot: "Pilot", phase_brief: "Brief",
    phaseLabel: "Phase",
    contextLead: "This is not a presentation about AI. You'll use AI to analyse your own work, identify opportunities, and design one concrete pilot.",
    fCompany: "Company", fWebsite: "Website", fIndustry: "Industry", fName: "Your name",
    fRole: "Your role (e.g. Drilling Engineer, HR Advisor)", fDepartment: "Department",
    fPainPoints: "What are 2–3 things you spend a lot of time on? (optional)", fMode: "Mode",
    modeFast: "Fast mode — 60 min", modeDeep: "Deep mode — 90 min",
    modeFastShort: "Fast mode", modeDeepShort: "Deep mode",
    researchBtn: "Research the company (optional) →", startBtn: "START DISCOVERY →", research: "Research",
    csStep1: "Copy the prompt below.", csStep2: "Paste it into your own Claude conversation (claude.ai).",
    csStep3: "Paste Claude's reply into the field below, and continue.",
    copyPrompt: "Copy prompt", copied: "✓ Copied", pasteLabel: "Paste Claude's reply",
    pastePlaceholder: "Paste here...", continueBtn: "Continue →", pasteEmpty: "Paste the reply first.",
    parseFailed: "Couldn't read that in the expected format. Make sure you pasted the whole reply, then try again.",
    workflowKicker: "Workflow discovery", workflowH1: "What do you actually do during a normal work week?",
    workflowLead: "Write down 5–10 recurring activities you perform as",
    workflowFieldLabel: "One activity per line",
    workflowPlaceholder: "e.g.\nPrepare drilling reports\nReview offset well data\nAnalyse drilling parameters",
    interviewBtn: "LET CLAUDE INTERVIEW YOU →", needOneActivity: "Write down at least one activity.",
    interviewKicker: "AI interview", interviewH1: "Tell us about your workflow",
    interviewLead: "Have the whole interview in your own Claude conversation. When Claude gives you a final JSON summary, paste it below.",
    pasteJsonLabel: "Paste the workflow JSON from Claude", buildMapBtn: "Build the map →",
    backBtn: "← Back to the activity list",
    mapKicker: "Workflow map", mapH1: "Here's what the workflow looks like",
    mapLead: "Check this is accurate before moving on to finding opportunities.",
    redoBtn: "Back to the interview", findOppBtn: "Find AI opportunities →",
    oppKicker: "AI Opportunity Discovery", oppH1: "Where could this workflow be improved?",
    oppLead: "Consider three types of solution for each step: AI, automation/regular software, and process improvement — not just AI.",
    lblProblem: "Problem", lblWhy: "Why", lblAlternative: "Alternative", lblChallenge: "Critical counter-check",
    selectForPriority: "Select this for prioritization", regenBtn: "Generate more", toPrioritizeBtn: "TO PRIORITIZATION →",
    prioKicker: "Prioritization", prioH1: "Pick the best problem, not just the coolest idea",
    prioLead: "Score each opportunity 0–5 on each dimension. The total score is a helper, not a verdict.",
    noOpportunitiesYet: "No opportunities generated yet. Go back to the previous phase.",
    useCase: "Use case", score: "Score",
    pickUseCase: "Selected use case for deep dive", pickPlaceholder: "— select —",
    toDeepDiveBtn: "DEEP DIVE ON SELECTED USE CASE →", pickOneFirst: "Pick a use case first.",
    matrixStrategic: "Strategic", matrixQuickWins: "Quick wins", matrixLowPriority: "Low priority",
    matrixLowHanging: "Low-hanging fruit", matrixImpactAxis: "Impact →", matrixFeasAxis: "Feasibility →",
    ddKicker: "Deep Dive", ddH1: "You are now investigating:",
    ddLead: "Understand the problem properly before designing the solution. Fill in what you know.",
    toSolutionsBtn: "EXPLORE SOLUTIONS →",
    solKicker: "Solution Exploration", solH1: "Don't fall in love with the first solution",
    solLead: "Use \"Challenge this solution\" on your favourite before you pick.",
    solutionLabel: "Solution", lblArchitecture: "Architecture", lblHumanInLoop: "Human-in-the-loop",
    lblComplexity: "Complexity", lblEffort: "Effort", lblBenefit: "Expected benefit",
    lblChallengeResult: "Critical challenge", challengeBtn: "CHALLENGE THIS SOLUTION",
    selectThis: "Select this", toPilotBtn: "DESIGN THE PILOT →", pickSolutionFirst: "Pick a solution first.",
    pilotKicker: "Pilot Design", pilotH1: "Turn the idea into a pilot",
    pilotLead: "Fill it in yourself, or let Claude suggest a first draft.",
    draftBtn: "Let Claude suggest a draft →", toBriefBtn: "GENERATE PILOT BRIEF →",
    briefKicker: "Pilot Brief", briefH1: "This is what you leave the room with",
    pasteBriefLabel: "Paste the pilot brief from Claude", showBriefBtn: "Show brief →",
    regenBriefBtn: "Regenerate", copyBriefBtn: "Copy to clipboard",
    mdBriefBtn: "Download as Markdown", pdfBriefBtn: "Print / save as PDF", copiedAlert: "Copied.",
    ctaHeading: "You've identified an opportunity. Now let's test whether it actually works.",
    ctaInternalTitle: "Explore internally", ctaInternalBody: "Take the pilot brief with you and discuss it internally. See also",
    ctaInternalLink: "the AI toolkit for engineers",
    ctaYcpTitle: "Build a pilot with YCP", ctaYcpBody: "We'll help you turn the selected use case into a working prototype.",
    ctaYcpBtn: "DISCUSS THE PILOT →",
  },
};

// ---------- Header controls ----------

document.addEventListener("DOMContentLoaded", () => {
  const modeBtn = document.getElementById("mode-toggle");
  modeBtn.textContent = state.mode === "fast" ? t("modeFastShort") : t("modeDeepShort");
  modeBtn.addEventListener("click", () => {
    state.mode = state.mode === "fast" ? "deep" : "fast";
    modeBtn.textContent = state.mode === "fast" ? t("modeFastShort") : t("modeDeepShort");
    saveState();
  });

  const langBtn = document.getElementById("lang-toggle");
  langBtn.textContent = state.lang === "no" ? "EN" : "NO";
  langBtn.addEventListener("click", () => {
    state.lang = state.lang === "no" ? "en" : "no";
    langBtn.textContent = state.lang === "no" ? "EN" : "NO";
    modeBtn.textContent = state.mode === "fast" ? t("modeFastShort") : t("modeDeepShort");
    saveState();
    render();
  });

  render();
});
