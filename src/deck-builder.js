/* ── Deck Builder ─────────────────────────────────────────
   Lets a user assemble one or more named decks from scratch and download
   them as a single JSON submission shaped exactly like the bot's
   data/decks/*.json files — which themselves often bundle several deck
   types together under one source (e.g. absol.json holds an agenda +
   relic + technology deck in one array). The form below builds ONE deck
   at a time; "Add this deck to submission" pushes it into `bundle`, and
   the download/preview always reflect the whole bundle.

   Depends on globals defined in main.js (CARDS, CARD_POOL_FOR_DECKTYPE,
   DECKS_DATA, AUTOMATION_LABELS) and ui.js (escHtml, escAttr, showToast,
   cardSearchText). */

const BUILDER_TYPES = [
  { type: "action_card", label: "Action Cards" },
  { type: "agenda", label: "Agendas" },
  { type: "relic", label: "Relics" },
  { type: "explore", label: "Exploration" },
  { type: "technology", label: "Technology" },
  { type: "secret_objective", label: "Secret Objectives" },
  { type: "public_stage_1_objective", label: "Stage I Public Objectives" },
  { type: "public_stage_2_objective", label: "Stage II Public Objectives" },
  { type: "event", label: "Events" },
];
const BUILDER_TYPE_LABELS = Object.fromEntries(BUILDER_TYPES.map(t => [t.type, t.label]));
const BUILDER_STORAGE_KEY = "ti4_deck_builder_draft_v1";

const builderState = {
  type: "action_card",
  alias: "",
  name: "",
  source: "",
  description: "",
  cardIds: [],
  search: "",
  filterSource: null,
  filterAutomation: null,
  bundle: [],   // decks already committed to this submission: {alias,name,type,description,source,cardIDs}
};

/* ── Mobile tab navigation (Form / Cards / Result) ──────────
   Same idea as the editor's setMobileView: the data-view attribute only
   matters under the narrow-screen media query in style.css. */
function setBuilderView(view) {
  document.getElementById("builder-main").dataset.view = view;
  document.querySelectorAll("#builder-mobile-tabs .mtab").forEach(el => el.classList.toggle("active", el.dataset.view === view));
}

function populateBuilderTypeSelect() {
  const sel = document.getElementById("builder-type");
  sel.innerHTML = BUILDER_TYPES.map(t => `<option value="${t.type}"${t.type === builderState.type ? " selected" : ""}>${escHtml(t.label)}</option>`).join("");
}

function onBuilderTypeChange() {
  const newType = document.getElementById("builder-type").value;
  if (newType !== builderState.type && builderState.cardIds.length) {
    showToast("Card selection cleared — deck type changed");
  }
  builderState.type = newType;
  builderState.cardIds = [];
  builderState.filterSource = null;
  builderState.filterAutomation = null;
  document.getElementById("builder-search").value = "";
  renderBuilder();
}

function onBuilderFieldInput() {
  builderState.alias = document.getElementById("builder-alias").value;
  builderState.name = document.getElementById("builder-name").value;
  builderState.source = document.getElementById("builder-source").value;
  builderState.description = document.getElementById("builder-description").value;
  renderBuilderValidation();
  renderBuilderJsonPreview();
  persistBuilderDraft();
}

function builderCardPool() {
  return CARDS[CARD_POOL_FOR_DECKTYPE[builderState.type]] || {};
}
function builderAllCards() {
  return Object.values(builderCardPool()).filter(c => !isDeprecated(c));
}
function builderVisibleCards() {
  const q = (document.getElementById("builder-search").value || "").trim().toLowerCase();
  const src = builderState.filterSource;
  const auto = builderState.filterAutomation;
  return builderAllCards().filter(c => {
    if (src && c.source !== src) return false;
    if (auto && c.automation !== auto) return false;
    if (q && !cardSearchText(c).includes(q)) return false;
    return true;
  });
}

function renderBuilderFilterBar(allCards) {
  const bar = document.getElementById("builder-filter-bar");
  const sources = [...new Set(allCards.map(c => c.source).filter(Boolean))].sort();
  if (sources.length < 2) { bar.classList.add("hidden"); bar.innerHTML = ""; }
  else {
    bar.classList.remove("hidden");
    const chips = [{ val: null, label: "All" }, ...sources.map(s => ({ val: s, label: s.toUpperCase() }))];
    bar.innerHTML = chips.map(ch =>
      `<span class="chip${builderState.filterSource === ch.val ? " active" : ""}" data-src="${ch.val ?? ""}">${escHtml(ch.label)}</span>`
    ).join("");
    bar.querySelectorAll(".chip").forEach(el => {
      el.onclick = () => { builderState.filterSource = el.dataset.src || null; renderBuilderCardList(); };
    });
  }

  const autoBar = document.getElementById("builder-filter-bar-automation");
  const hasAutomation = allCards.some(c => c.automation);
  if (!hasAutomation) { autoBar.classList.add("hidden"); autoBar.innerHTML = ""; return; }
  autoBar.classList.remove("hidden");
  const autoChips = [{ val: null, label: "All" }, ...Object.entries(AUTOMATION_LABELS).map(([val, label]) => ({ val, label }))];
  autoBar.innerHTML = autoChips.map(ch =>
    `<span class="chip${builderState.filterAutomation === ch.val ? " active" : ""}" data-auto="${ch.val ?? ""}">${escHtml(ch.label)}</span>`
  ).join("");
  autoBar.querySelectorAll(".chip").forEach(el => {
    el.onclick = () => { builderState.filterAutomation = el.dataset.auto || null; renderBuilderCardList(); };
  });
}

function renderBuilderCardList() {
  const allCards = builderAllCards();
  renderBuilderFilterBar(allCards);
  const visible = builderVisibleCards();
  document.getElementById("builder-available-count").textContent = `${visible.length} shown · ${builderState.cardIds.length} added`;

  const listEl = document.getElementById("builder-card-list");
  if (visible.length === 0) {
    listEl.innerHTML = `<div class="list-empty">No cards match.</div>`;
    return;
  }
  const addedSet = new Set(builderState.cardIds);
  listEl.innerHTML = visible.map(c => {
    const key = c.alias || c.id;
    const isAdded = addedSet.has(key);
    const metaBits = [
      c.source ? c.source.toUpperCase() : "",
      c.automation ? `<span class="auto-${c.automation}">${escHtml(AUTOMATION_LABELS[c.automation] || c.automation)}</span>` : "",
    ].filter(Boolean);
    return `<div class="card-item${isAdded ? " active" : ""}" data-key="${escAttr(key)}">
  <input type="checkbox" class="card-cb" data-key="${escAttr(key)}" ${isAdded ? "checked" : ""} />
  <div class="card-info">
    <div class="card-name">${escHtml(c.name || key)}</div>
    <div class="card-meta">${metaBits.join(" · ")}</div>
  </div>
</div>`;
  }).join("");
  listEl.querySelectorAll(".card-item, .card-cb").forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); toggleBuilderCard(el.dataset.key); };
  });
}

function toggleBuilderCard(key) {
  const idx = builderState.cardIds.indexOf(key);
  if (idx === -1) builderState.cardIds.push(key);
  else builderState.cardIds.splice(idx, 1);
  renderBuilderCardList();
  renderBuilderSelectedList();
  renderBuilderValidation();
  renderBuilderJsonPreview();
  persistBuilderDraft();
}
function removeBuilderCard(key) {
  toggleBuilderCard(key);
}

function renderBuilderSelectedList() {
  const pool = builderCardPool();
  document.getElementById("builder-selected-count").textContent = builderState.cardIds.length;
  const listEl = document.getElementById("builder-selected-list");
  if (builderState.cardIds.length === 0) {
    listEl.innerHTML = `<div class="list-empty">No cards added yet — pick some from the middle panel.</div>`;
    return;
  }
  listEl.innerHTML = builderState.cardIds.map(key => {
    const c = pool[key];
    return `<div class="builder-sel-item">
  <span class="sel-name">${escHtml(c ? (c.name || key) : key)}</span>
  <button class="builder-sel-remove" data-key="${escAttr(key)}" title="Remove">✕</button>
</div>`;
  }).join("");
  listEl.querySelectorAll(".builder-sel-remove").forEach(el => {
    el.onclick = () => removeBuilderCard(el.dataset.key);
  });
}

function validateCurrentDeck() {
  const errors = [];
  const alias = builderState.alias.trim();
  const name = builderState.name.trim();
  if (!alias) errors.push("Alias is required.");
  else {
    if (DECKS_DATA[alias]) errors.push(`Alias "${alias}" already exists in the synced data — choose a unique alias.`);
    if (builderState.bundle.some(d => d.alias === alias)) errors.push(`Alias "${alias}" is already used by another deck in this submission.`);
  }
  if (!name) errors.push("Name is required.");
  if (builderState.cardIds.length === 0) errors.push("Add at least one card.");
  return errors;
}

function renderBuilderValidation() {
  const errors = validateCurrentDeck();
  const el = document.getElementById("builder-validation");
  el.innerHTML = errors.length
    ? errors.map(e => `<div class="validation-error">⚠ ${escHtml(e)}</div>`).join("")
    : `<div class="validation-ok">✓ Ready to add to submission</div>`;
}

/* Key order matches the bot's own data/decks/*.json files exactly
   (alias, name, type, description, cardIDs, source) — JSON parsing
   doesn't care about key order, but some repo-side tooling/PR diffing
   does string/line comparisons, so this is a real mirror, not just a
   field-set match. */
function buildCurrentDeckObject() {
  return {
    alias: builderState.alias.trim(),
    name: builderState.name.trim(),
    type: builderState.type,
    description: builderState.description.trim(),
    cardIDs: [...builderState.cardIds],
    source: builderState.source.trim() || "homebrew",
  };
}

/* ── Bundle (the decks already committed to this submission) ────────── */
function addCurrentDeckToBundle() {
  const errors = validateCurrentDeck();
  if (errors.length) {
    showToast(errors[0]);
    return;
  }
  const deckObj = buildCurrentDeckObject();
  builderState.bundle.push(deckObj);

  const keepSource = builderState.source;
  builderState.alias = "";
  builderState.name = "";
  builderState.description = "";
  builderState.cardIds = [];
  builderState.source = keepSource; // decks in one submission usually share a source
  builderState.filterSource = null;
  builderState.filterAutomation = null;
  document.getElementById("builder-search").value = "";

  renderBuilder();
  persistBuilderDraft();
  showToast(`Added "${deckObj.name}" to submission (${builderState.bundle.length} deck${builderState.bundle.length !== 1 ? "s" : ""} so far)`);
}

function editBundleItem(index) {
  const [deckObj] = builderState.bundle.splice(index, 1);
  if (!deckObj) return;
  builderState.type = deckObj.type;
  builderState.alias = deckObj.alias;
  builderState.name = deckObj.name;
  builderState.source = deckObj.source;
  builderState.description = deckObj.description;
  builderState.cardIds = [...deckObj.cardIDs];
  builderState.filterSource = null;
  builderState.filterAutomation = null;
  document.getElementById("builder-search").value = "";
  renderBuilder();
  persistBuilderDraft();
}

function removeBundleItem(index) {
  const [removed] = builderState.bundle.splice(index, 1);
  renderBundleList();
  renderBuilderJsonPreview();
  persistBuilderDraft();
  if (removed) showToast(`Removed "${removed.name}" from submission`);
}

function renderBundleList() {
  document.getElementById("bundle-count").textContent = builderState.bundle.length;
  const listEl = document.getElementById("bundle-list");
  if (builderState.bundle.length === 0) {
    listEl.innerHTML = `<div class="list-empty">No decks added yet — build one on the left, then "Add this deck to submission".</div>`;
    return;
  }
  listEl.innerHTML = builderState.bundle.map((d, i) => `<div class="bundle-item">
  <span class="sel-name">${escHtml(d.name)}</span>
  <span class="sel-meta">${escHtml(BUILDER_TYPE_LABELS[d.type] || d.type)} · ${d.cardIDs.length} cards</span>
  <button class="bundle-edit" data-index="${i}" title="Edit">✎</button>
  <button class="bundle-remove" data-index="${i}" title="Remove">✕</button>
</div>`).join("");
  listEl.querySelectorAll(".bundle-edit").forEach(el => {
    el.onclick = () => editBundleItem(Number(el.dataset.index));
  });
  listEl.querySelectorAll(".bundle-remove").forEach(el => {
    el.onclick = () => removeBundleItem(Number(el.dataset.index));
  });
}

function renderBuilderJsonPreview() {
  document.getElementById("builder-json-preview").textContent = JSON.stringify(builderState.bundle, null, 2);
}

function downloadBuilderDeck() {
  if (builderState.bundle.length === 0) {
    showToast("Add at least one deck to the submission first");
    return;
  }
  const sources = new Set(builderState.bundle.map(d => d.source));
  const filename = sources.size === 1 ? `${[...sources][0]}.json` : "ti4_custom_decks.json";
  const blob = new Blob([JSON.stringify(builderState.bundle, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  showToast(`Submission JSON downloaded (${builderState.bundle.length} deck${builderState.bundle.length !== 1 ? "s" : ""})`);
}

function resetBuilder() {
  builderState.alias = "";
  builderState.name = "";
  builderState.source = "";
  builderState.description = "";
  builderState.cardIds = [];
  builderState.filterSource = null;
  builderState.filterAutomation = null;
  builderState.bundle = [];
  renderBuilder();
  persistBuilderDraft();
  showToast("Deck builder cleared");
}

function renderBuilder() {
  populateBuilderTypeSelect();
  document.getElementById("builder-alias").value = builderState.alias;
  document.getElementById("builder-name").value = builderState.name;
  document.getElementById("builder-source").value = builderState.source;
  document.getElementById("builder-description").value = builderState.description;
  document.getElementById("builder-search").value = "";
  renderBuilderCardList();
  renderBuilderSelectedList();
  renderBuilderValidation();
  renderBundleList();
  renderBuilderJsonPreview();
}

function persistBuilderDraft() {
  try { localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(builderState)); }
  catch (e) { /* storage unavailable — not fatal */ }
}
function loadBuilderDraft() {
  try {
    const raw = localStorage.getItem(BUILDER_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(builderState, {
      type: data.type || "action_card",
      alias: data.alias || "",
      name: data.name || "",
      source: data.source || "",
      description: data.description || "",
      cardIds: Array.isArray(data.cardIds) ? data.cardIds : [],
      bundle: Array.isArray(data.bundle) ? data.bundle : [],
    });
  } catch (e) { /* corrupt/old draft — ignore */ }
}
