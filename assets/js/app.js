const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const DATA_URL = "data/names.json";
const STORE_KEY = "names99_state_v1";

const defaultPrefs = {
  showTranslit: true,
  showPhonetic: true,
  showLong: true
};

function nowMs(){ return Date.now(); }
function dayKey(ts = Date.now()){
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){
    return null;
  }
}

function saveState(state){
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function freshState(names){
  const items = {};
  for(const n of names){
    items[n.id] = {
      checked: false,
      notes: "",
      srs: {
        level: 0,
        next: 0
      },
      lastSeen: 0
    };
  }
  return {
    version: 1,
    createdAt: nowMs(),
    prefs: {...defaultPrefs},
    cursorId: 1,
    streak: {
      lastDay: "",
      count: 0
    },
    items
  };
}

function updateStreak(state){
  const today = dayKey();
  if(state.streak.lastDay === today) return;

  if(!state.streak.lastDay){
    state.streak.lastDay = today;
    state.streak.count = 1;
    return;
  }

  const last = new Date(state.streak.lastDay + "T00:00:00");
  const t = new Date(today + "T00:00:00");
  const diffDays = Math.round((t - last) / 86400000);

  if(diffDays === 1){
    state.streak.count += 1;
  }else{
    state.streak.count = 1;
  }
  state.streak.lastDay = today;
}

function srsSchedule(level, grade){
  let nextDays = 0;

  if(grade === "hard") nextDays = 1;
  if(grade === "again") nextDays = 3;
  if(grade === "good") nextDays = 7;
  if(grade === "master") nextDays = 21;

  let newLevel = level;
  if(grade === "hard") newLevel = clamp(level, 0, 6);
  if(grade === "again") newLevel = clamp(level + 1, 0, 6);
  if(grade === "good") newLevel = clamp(level + 2, 0, 6);
  if(grade === "master") newLevel = 6;

  return { newLevel, nextMs: nowMs() + nextDays * 86400000 };
}

function safeText(s){
  return (s ?? "").toString();
}

function renderNameCard(name, state){
  const it = state.items[name.id] || {};
  const prefs = state.prefs || defaultPrefs;

  const ar = safeText(name.ar).trim() || "À remplir";
  const translit = safeText(name.translit).trim();
  const phonetic = safeText(name.phonetic).trim();
  const frShort = safeText(name.frShort).trim() || "Sens court à remplir";
  const frLong = safeText(name.frLong).trim() || "";

  const tags = Array.isArray(name.tags) ? name.tags : [];
  const pairs = Array.isArray(name.pairs) ? name.pairs : [];

  const metaParts = [];
  if(prefs.showTranslit && translit) metaParts.push(`<span class="badge">${translit}</span>`);
  if(prefs.showPhonetic && phonetic) metaParts.push(`<span class="badge">${phonetic}</span>`);
  metaParts.push(`<span class="badge">N° ${name.id}</span>`);
  if(it.checked) metaParts.push(`<span class="badge">Coché</span>`);
  if(it.srs?.next && it.srs.next > 0){
    const d = new Date(it.srs.next);
    metaParts.push(`<span class="badge">Revoir: ${d.toLocaleDateString("fr-FR")}</span>`);
  }

  const tagHtml = tags.length ? `<div class="tileMeta">${tags.map(t=>`<span class="badge">${safeText(t)}</span>`).join("")}</div>` : "";
  const pairHtml = pairs.length ? `<div class="tileMeta">${pairs.map(p=>`<span class="badge">Pair ${p}</span>`).join("")}</div>` : "";

  const longHtml = prefs.showLong && frLong
    ? `<div class="frLong">${frLong}</div>`
    : prefs.showLong ? `<div class="frLong muted">Sens approfondi à compléter</div>` : "";

  const note = safeText(it.notes);

  return `
    <div class="ar" dir="rtl">${ar}</div>
    <div class="meta">${metaParts.join("")}</div>
    <div class="frShort">${frShort}</div>
    ${longHtml}
    ${tagHtml}
    ${pairHtml}
    <div class="noteBox">
      <div class="muted small">Note personnelle</div>
      <textarea id="noteArea" placeholder="Écris ici ce que tu veux retenir…">${note}</textarea>
      <label class="switch">
        <input id="checkBox" type="checkbox" ${it.checked ? "checked" : ""} />
        <span>Marquer comme acquis</span>
      </label>
    </div>
  `;
}

function updateProgress(names, state){
  const total = names.length;
  const checked = names.filter(n => state.items[n.id]?.checked).length;
  const pct = total ? Math.round((checked / total) * 100) : 0;

  $("#progressText").textContent = `${checked} / ${total} cochés`;
  $("#streakText").textContent = state.streak.count ? `Série: ${state.streak.count} jour(s)` : "";

  $("#barFill").style.width = `${pct}%`;
  $(".bar").setAttribute("aria-valuenow", String(checked));
}

function setView(view){
  $$(".tab").forEach(t => t.classList.toggle("is-active", t.dataset.view === view));
  $$(".view").forEach(v => v.classList.toggle("is-active", v.id === `view-${view}`));
}

function fillTags(names){
  const set = new Set();
  for(const n of names){
    if(Array.isArray(n.tags)){
      for(const t of n.tags){
        const x = safeText(t).trim();
        if(x) set.add(x);
      }
    }
  }
  const select = $("#tagSelect");
  const current = select.value;
  select.innerHTML = `<option value="">Tous les thèmes</option>` + Array.from(set).sort((a,b)=>a.localeCompare(b,"fr"))
    .map(t => `<option value="${t}">${t}</option>`).join("");
  select.value = current;
}

function renderListGrid(names, state, targetId){
  const box = $(targetId);
  box.innerHTML = "";

  for(const n of names){
    const it = state.items[n.id] || {};
    const ar = safeText(n.ar).trim() || "À remplir";
    const fr = safeText(n.frShort).trim() || "Sens à remplir";

    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="tileTop">
        <div class="id">N° ${n.id}</div>
        <label class="chk">
          <input type="checkbox" ${it.checked ? "checked":""} data-id="${n.id}" />
          <span>Acquis</span>
        </label>
      </div>
      <div class="tileAr" dir="rtl">${ar}</div>
      <div class="tileFr">${fr}</div>
      <div class="tileMeta">
        <span class="badge">Ouvrir</span>
        ${Array.isArray(n.tags) && n.tags.length ? `<span class="badge">${safeText(n.tags[0])}</span>` : ""}
      </div>
    `;

    tile.addEventListener("click", (e) => {
      const input = e.target?.tagName === "INPUT";
      if(input) return;
      state.cursorId = n.id;
      saveState(state);
      showCardById(n.id);
      setView("review");
    });

    tile.querySelector("input")?.addEventListener("change", (e) => {
      const id = Number(e.target.dataset.id);
      state.items[id].checked = !!e.target.checked;
      saveState(state);
      updateProgress(names, state);
    });

    box.appendChild(tile);
  }
}

let NAMES = [];
let STATE = null;

function showCardById(id){
  const name = NAMES.find(n => n.id === id) || NAMES[0];
  if(!name) return;

  STATE.cursorId = name.id;
  const card = $("#nameCard");
  card.innerHTML = renderNameCard(name, STATE);

  const noteArea = $("#noteArea", card);
  noteArea?.addEventListener("input", () => {
    STATE.items[name.id].notes = noteArea.value;
    saveState(STATE);
  });

  const check = $("#checkBox", card);
  check?.addEventListener("change", () => {
    STATE.items[name.id].checked = !!check.checked;
    saveState(STATE);
    updateProgress(NAMES, STATE);
    renderListGrid(filteredNames(), STATE, "#listGrid");
    renderListGrid(filteredExplore(), STATE, "#exploreGrid");
  });

  updateProgress(NAMES, STATE);
}

function moveCursor(delta){
  const idx = NAMES.findIndex(n => n.id === STATE.cursorId);
  const next = clamp(idx + delta, 0, NAMES.length - 1);
  showCardById(NAMES[next].id);
}

function gradeCurrent(grade){
  const id = STATE.cursorId;
  const it = STATE.items[id];
  updateStreak(STATE);

  const level = it.srs?.level ?? 0;
  const sch = srsSchedule(level, grade);
  it.srs.level = sch.newLevel;
  it.srs.next = sch.nextMs;
  it.lastSeen = nowMs();

  if(grade === "master") it.checked = true;

  saveState(STATE);
  showCardById(id);
}

function dueNames(){
  const t = nowMs();
  const due = NAMES.filter(n => {
    const it = STATE.items[n.id];
    const next = it?.srs?.next ?? 0;
    return next > 0 && next <= t;
  });
  return due;
}

function newNames(){
  const seen = NAMES.filter(n => (STATE.items[n.id]?.lastSeen ?? 0) > 0);
  if(seen.length === 0) return NAMES;
  const maxSeenId = Math.max(...seen.map(n=>n.id));
  return NAMES.filter(n => n.id > maxSeenId);
}

function buildDailySession(size){
  const due = dueNames();
  const fresh = newNames();

  const session = [];
  for(const n of due){
    if(session.length >= size) break;
    session.push(n);
  }
  for(const n of fresh){
    if(session.length >= size) break;
    session.push(n);
  }
  return session;
}

function renderDaily(session){
  const box = $("#dailyBox");
  if(session.length === 0){
    box.innerHTML = `<div class="muted">Aucun Nom planifié. Tu peux continuer dans Réviser.</div>`;
    return;
  }

  let i = 0;
  const current = () => session[i];

  const render = () => {
    const n = current();
    if(!n){
      box.innerHTML = `<div class="muted">Session terminée</div>`;
      return;
    }

    box.innerHTML = `
      <div class="nameCard">
        ${renderNameCard(n, STATE)}
        <div class="actions">
          <button class="btn" data-g="hard">Difficile</button>
          <button class="btn" data-g="again">À revoir</button>
          <button class="btn" data-g="good">Je sais</button>
          <button class="btn btn-primary" data-g="master">Appris</button>
          <button class="btn btn-ghost" data-g="skip">Passer</button>
        </div>
      </div>
    `;

    $("#noteArea", box)?.addEventListener("input", (e) => {
      STATE.items[n.id].notes = e.target.value;
      saveState(STATE);
    });

    $("#checkBox", box)?.addEventListener("change", (e) => {
      STATE.items[n.id].checked = !!e.target.checked;
      saveState(STATE);
      updateProgress(NAMES, STATE);
    });

    $$(".actions button", box).forEach(b => {
      b.addEventListener("click", () => {
        const g = b.dataset.g;
        if(g !== "skip") gradeById(n.id, g);
        i += 1;
        render();
        renderListGrid(filteredNames(), STATE, "#listGrid");
        renderListGrid(filteredExplore(), STATE, "#exploreGrid");
      });
    });
  };

  render();
}

function gradeById(id, grade){
  const it = STATE.items[id];
  updateStreak(STATE);

  const level = it.srs?.level ?? 0;
  const sch = srsSchedule(level, grade);
  it.srs.level = sch.newLevel;
  it.srs.next = sch.nextMs;
  it.lastSeen = nowMs();

  if(grade === "master") it.checked = true;

  saveState(STATE);
  updateProgress(NAMES, STATE);
}

function filteredNames(){
  const q = safeText($("#searchInput").value).trim().toLowerCase();
  if(!q) return NAMES;

  return NAMES.filter(n => {
    const a = safeText(n.ar).toLowerCase();
    const t = safeText(n.translit).toLowerCase();
    const p = safeText(n.phonetic).toLowerCase();
    const f1 = safeText(n.frShort).toLowerCase();
    const f2 = safeText(n.frLong).toLowerCase();
    return a.includes(q) || t.includes(q) || p.includes(q) || f1.includes(q) || f2.includes(q);
  });
}

function filteredExplore(){
  const tag = $("#tagSelect").value;
  const q = safeText($("#searchInput").value).trim().toLowerCase();
  return NAMES.filter(n => {
    const okTag = !tag || (Array.isArray(n.tags) && n.tags.includes(tag));
    if(!okTag) return false;
    if(!q) return true;
    const t = safeText(n.translit).toLowerCase();
    const f1 = safeText(n.frShort).toLowerCase();
    const f2 = safeText(n.frLong).toLowerCase();
    return t.includes(q) || f1.includes(q) || f2.includes(q);
  });
}

async function boot(){
  const res = await fetch(DATA_URL, { cache: "no-store" });
  NAMES = await res.json();
  NAMES = NAMES
    .filter(x => typeof x.id === "number")
    .sort((a,b) => a.id - b.id);

  STATE = loadState();
  if(!STATE) STATE = freshState(NAMES);

  for(const n of NAMES){
    if(!STATE.items[n.id]){
      STATE.items[n.id] = {
        checked:false,
        notes:"",
        srs:{level:0,next:0},
        lastSeen:0
      };
    }
  }

  saveState(STATE);

  fillTags(NAMES);

  setView("review");
  showCardById(STATE.cursorId || 1);

  renderListGrid(filteredNames(), STATE, "#listGrid");
  renderListGrid(filteredExplore(), STATE, "#exploreGrid");
  updateProgress(NAMES, STATE);

  $$(".tab").forEach(t => {
    t.addEventListener("click", () => {
      setView(t.dataset.view);
      if(t.dataset.view === "list") renderListGrid(filteredNames(), STATE, "#listGrid");
      if(t.dataset.view === "explore") renderListGrid(filteredExplore(), STATE, "#exploreGrid");
    });
  });

  $("#prevBtn").addEventListener("click", () => moveCursor(-1));
  $("#nextBtn").addEventListener("click", () => moveCursor(1));

  $("#hardBtn").addEventListener("click", () => gradeCurrent("hard"));
  $("#againBtn").addEventListener("click", () => gradeCurrent("again"));
  $("#goodBtn").addEventListener("click", () => gradeCurrent("good"));
  $("#masterBtn").addEventListener("click", () => gradeCurrent("master"));

  document.addEventListener("keydown", (e) => {
    if(e.key === "ArrowLeft") moveCursor(-1);
    if(e.key === "ArrowRight") moveCursor(1);
  });

  $("#searchInput").addEventListener("input", () => {
    renderListGrid(filteredNames(), STATE, "#listGrid");
    renderListGrid(filteredExplore(), STATE, "#exploreGrid");
  });

  $("#tagSelect").addEventListener("change", () => {
    renderListGrid(filteredExplore(), STATE, "#exploreGrid");
  });
  $("#clearTagBtn").addEventListener("click", () => {
    $("#tagSelect").value = "";
    renderListGrid(filteredExplore(), STATE, "#exploreGrid");
  });

  $("#startDailyBtn").addEventListener("click", () => {
    const size = clamp(Number($("#dailySize").value || 12), 5, 30);
    const session = buildDailySession(size);
    renderDaily(session);
  });

  $("#showTranslit").checked = !!STATE.prefs.showTranslit;
  $("#showPhonetic").checked = !!STATE.prefs.showPhonetic;
  $("#showLong").checked = !!STATE.prefs.showLong;

  $("#showTranslit").addEventListener("change", (e) => {
    STATE.prefs.showTranslit = !!e.target.checked;
    saveState(STATE);
    showCardById(STATE.cursorId);
  });
  $("#showPhonetic").addEventListener("change", (e) => {
    STATE.prefs.showPhonetic = !!e.target.checked;
    saveState(STATE);
    showCardById(STATE.cursorId);
  });
  $("#showLong").addEventListener("change", (e) => {
    STATE.prefs.showLong = !!e.target.checked;
    saveState(STATE);
    showCardById(STATE.cursorId);
  });

  $("#exportBtn").addEventListener("click", () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      state: STATE
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "progression-99-noms.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("#resetBtn").addEventListener("click", () => {
    localStorage.removeItem(STORE_KEY);
    location.reload();
  });
}

boot().catch(err => {
  console.error(err);
  $("#progressText").textContent = "Erreur de chargement";
});