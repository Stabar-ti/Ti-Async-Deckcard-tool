/* ── The main 9-slot deck editor ───────────────────────────
   Depends on globals defined in main.js (DECKS_DATA, CARDS,
   CARD_POOL_FOR_DECKTYPE, AUTOMATION_LABELS) and ui.js (escHtml, escAttr,
   showToast, addIssue, cardSearchText, initResizeHandle). */

/* ── Slot configuration (the bot's 9 DeckModel slots) ─────── */
const SLOTS = [
  { key: "ac_deck",           type: "action_card",              param: "ac_deck",           label: "Action Cards" },
  { key: "agenda_deck",       type: "agenda",                    param: "agenda_deck",       label: "Agendas" },
  { key: "relic_deck",        type: "relic",                     param: "relic_deck",        label: "Relics" },
  { key: "exploration_decks", type: "explore",                   param: "exploration_decks", label: "Exploration" },
  { key: "technology_deck",   type: "technology",                param: "technology_deck",   label: "Technology", hidden: true,
    note: "Applying an Absol-source technology deck causes the bot to auto-upgrade faction techs to their Absol variants. This is a bot-side side effect, not something this editor changes." },
  { key: "so_deck",           type: "secret_objective",          param: "so_deck",           label: "Secret Objectives" },
  { key: "s1_public_deck",    type: "public_stage_1_objective",  param: "s1_public_deck",    label: "Stage I Public" },
  { key: "s2_public_deck",    type: "public_stage_2_objective",  param: "s2_public_deck",    label: "Stage II Public" },
  { key: "event_deck",        type: "event",                     param: "event_deck",        label: "Events", hidden: true },
];
const SLOT_BY_KEY = Object.fromEntries(SLOTS.map(s => [s.key, s]));
const VISIBLE_SLOTS = SLOTS.filter(s => !s.hidden);

/* ── State ───────────────────────────────────────────────── */
const state = {
  slots: Object.fromEntries(SLOTS.map(s => [s.key, null])),
  exclusions: {},   // deckAlias -> Set of card keys
  activeSlot: SLOTS[0].key,
  activeCard: null,
  search: "",
  filterSource: null,
  filterAutomation: null,
  outputOpen: false,
};

function activeSlotDef() { return SLOT_BY_KEY[state.activeSlot]; }
function activeDeckAlias() { return state.slots[state.activeSlot]; }
function activeDeck() {
  const alias = activeDeckAlias();
  return alias ? DECKS_DATA[alias] : null;
}
function activeCardPool() {
  const slot = activeSlotDef();
  return CARDS[CARD_POOL_FOR_DECKTYPE[slot.type]] || {};
}
function exclSetFor(deckAlias) {
  if (!state.exclusions[deckAlias]) state.exclusions[deckAlias] = new Set();
  return state.exclusions[deckAlias];
}

function checkDeckForMissingCards(deck, slotLabel) {
  if (!deck) return;
  const pool = CARDS[CARD_POOL_FOR_DECKTYPE[deck.type]] || {};
  const missing = deck.cardIDs.filter(id => !pool[id]);
  if (missing.length) {
    addIssue(`"${deck.name}" (${slotLabel}) is missing ${missing.length} card${missing.length !== 1 ? "s" : ""} in the synced data: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", …" : ""}. The rest of the deck still loaded.`);
  }
}
function checkAllSlotsForMissingCards() {
  SLOTS.forEach(s => {
    const alias = state.slots[s.key];
    if (alias && DECKS_DATA[alias]) checkDeckForMissingCards(DECKS_DATA[alias], s.label);
  });
}

/* ── Config persistence ──────────────────────────────────────
   Schema is intentionally the same shape the bot would need: `slots` maps
   1:1 to /game set_deck's options, `exclusions` maps deck alias -> card
   IDs to remove (the same data collectRemovalLines() already builds the
   /custom remove_*_from_game commands from). Could be POSTed to a future
   bot endpoint as-is. */
const CONFIG_SCHEMA = "ti4-deck-editor-config";
const CONFIG_VERSION = 1;
const STORAGE_KEY = "ti4_deck_editor_config_v1";

function serializeConfig() {
  const exclusions = {};
  Object.entries(state.exclusions).forEach(([deckAlias, set]) => {
    if (set && set.size) exclusions[deckAlias] = [...set];
  });
  return {
    schema: CONFIG_SCHEMA,
    version: CONFIG_VERSION,
    savedAt: new Date().toISOString(),
    slots: { ...state.slots },
    exclusions,
  };
}

function applyConfig(data) {
  if (!data || data.schema !== CONFIG_SCHEMA) {
    showToast("Not a recognised TI4 Deck Editor config file");
    return false;
  }
  SLOTS.forEach(s => {
    const alias = data.slots && data.slots[s.key];
    if (alias && DECKS_DATA[alias]) {
      state.slots[s.key] = alias;
    } else {
      state.slots[s.key] = null;
      if (alias) addIssue(`Saved deck "${alias}" for slot "${s.label}" no longer exists in the synced data — slot left unconfigured.`);
    }
  });
  state.exclusions = {};
  Object.entries(data.exclusions || {}).forEach(([deckAlias, ids]) => {
    if (!Array.isArray(ids) || !ids.length) return;
    const deck = DECKS_DATA[deckAlias];
    if (!deck) {
      addIssue(`Saved exclusions referenced deck "${deckAlias}", which no longer exists — those exclusions were dropped.`);
      return;
    }
    state.exclusions[deckAlias] = new Set(ids);
    const pool = CARDS[CARD_POOL_FOR_DECKTYPE[deck.type]] || {};
    const missingIds = ids.filter(id => !pool[id]);
    if (missingIds.length) {
      addIssue(`"${deck.name}" had ${missingIds.length} previously-excluded card${missingIds.length !== 1 ? "s" : ""} that no longer exist: ${missingIds.join(", ")}.`);
    }
  });
  state.selected = {};
  state.activeCard = null;
  checkAllSlotsForMissingCards();
  return true;
}

function persistToLocalStorage() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeConfig())); }
  catch (e) { /* storage unavailable (e.g. private browsing) — not fatal */ }
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) applyConfig(JSON.parse(raw));
  } catch (e) { /* corrupt/old data — ignore and start fresh */ }
}

function downloadConfig() {
  const blob = new Blob([JSON.stringify(serializeConfig(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ti4-deck-config.json";
  a.click();
  showToast("Config downloaded");
}

function handleLoadConfigFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (applyConfig(data)) {
        renderRail(); renderPicker(); renderCardBrowser(); clearDetail(); updateOutput();
        showToast("Config loaded");
      }
    } catch (err) {
      showToast("Could not parse config file: " + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

/* ── Slot rail ───────────────────────────────────────────── */
function renderRail() {
  const rail = document.getElementById("rail");
  rail.innerHTML = VISIBLE_SLOTS.map(s => {
    const alias = state.slots[s.key];
    const deck = alias ? DECKS_DATA[alias] : null;
    const valueHtml = deck
      ? `<span class="slot-dot"></span>${escHtml(deck.name)}`
      : `<span class="slot-value unset">not configured</span>`;
    return `<div class="slot-btn${s.key === state.activeSlot ? " active" : ""}${deck ? " has-deck" : ""}" data-key="${s.key}">
      <span class="slot-label">${escHtml(s.label)}</span>
      <span class="slot-value${deck ? "" : " unset"}">${deck ? valueHtml : "not configured"}</span>
    </div>`;
  }).join("");
  rail.querySelectorAll(".slot-btn").forEach(el => {
    el.onclick = () => switchSlot(el.dataset.key);
  });
}

function switchSlot(key) {
  state.activeSlot = key;
  state.activeCard = null;
  state.filterSource = null;
  state.filterAutomation = null;
  document.getElementById("search").value = "";
  renderRail();
  renderPicker();
  renderCardBrowser();
  clearDetail();
  updateOutput();
}

/* ── Deck picker (left panel) ───────────────────────────── */
/* Main-line sources surface first in every deck picker, in this order;
   everything else (homebrew) sorts after, by automation then name. */
const SOURCE_PRIORITY = {
  thunders_edge: 0,
  pok: 1,
  twilights_fall: 2,
  base: 3,
  __default: 4,
};

function deckAutomationStats(deck) {
  const pool = CARDS[CARD_POOL_FOR_DECKTYPE[deck.type]] || {};
  let auto = 0, intg = 0, other = 0, known = 0;
  deck.cardIDs.forEach(id => {
    const c = pool[id];
    if (!c || isDeprecated(c) || !c.automation) return;
    known++;
    if (c.automation === "automated") auto++;
    else if (c.automation === "integrated") intg++;
    else other++;
  });
  return {
    known, auto, intg, other,
    autoPct: known ? auto / known : 0,
    assistedPct: known ? (auto + intg) / known : 0,
  };
}

function renderPicker() {
  const slot = activeSlotDef();
  document.getElementById("picker-title").textContent = `Slot: ${slot.label}`;
  document.getElementById("picker-sub").textContent = `/game set_deck ${slot.param}:<alias>`;

  const noteEl = document.getElementById("picker-note");
  if (slot.note) { noteEl.textContent = slot.note; noteEl.classList.add("visible"); }
  else { noteEl.classList.remove("visible"); }

  let decks = Object.values(DECKS_DATA).filter(d => d.type === slot.type && d.cardIDs.length > 0);
  const deckStats = new Map(decks.map(d => [d.alias, deckAutomationStats(d)]));
  const hasAutomationData = decks.some(d => deckStats.get(d.alias).known > 0);

  decks.sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.source] ?? SOURCE_PRIORITY.__default;
    const pb = SOURCE_PRIORITY[b.source] ?? SOURCE_PRIORITY.__default;
    if (pa !== pb) return pa - pb;
    if (hasAutomationData) {
      const sa = deckStats.get(a.alias), sb = deckStats.get(b.alias);
      return sb.autoPct - sa.autoPct || sb.assistedPct - sa.assistedPct || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });
  const listEl = document.getElementById("deck-list");

  if (decks.length === 0) {
    listEl.innerHTML = `<div id="deck-list-empty">No decks of type "${escHtml(slot.type)}" available yet.</div>`;
    return;
  }

  const selectedAlias = state.slots[slot.key];
  let html = "";
  if (selectedAlias) {
    html += `<div class="deck-clear" data-action="clear">✕ Clear this slot</div>`;
  }
  html += `<div class="deck-list-hint">Main-line decks first (TE → PoK → TF → Base)${hasAutomationData ? ", then by how much the bot handles for you" : ""}.</div>`;
  html += decks.map(d => {
    const isSel = d.alias === selectedAlias;
    let autoLine = "";
    const s = deckStats.get(d.alias);
    if (s.known) {
      const pct = n => Math.round((n / s.known) * 100);
      autoLine = `<div class="deck-meta">${pct(s.auto)}% automated · ${pct(s.intg)}% integrated · ${pct(s.other)}% manual</div>`;
    }
    return `<div class="deck-item${isSel ? " selected" : ""}" data-alias="${escAttr(d.alias)}">
      <div class="deck-name">${escHtml(d.name)}</div>
      <div class="deck-meta">${d.cardIDs.length} cards · ${escHtml(d.source || "")} · <span class="mono">${escHtml(d.alias)}</span></div>
      ${autoLine}
      ${d.description ? `<div class="deck-desc" title="${escAttr(d.description)}">${escHtml(d.description)}</div>` : ""}
    </div>`;
  }).join("");
  listEl.innerHTML = html;

  const clearEl = listEl.querySelector('[data-action="clear"]');
  if (clearEl) clearEl.onclick = () => selectDeck(null);
  listEl.querySelectorAll(".deck-item").forEach(el => {
    el.onclick = () => selectDeck(el.dataset.alias);
  });
}

function selectDeck(alias) {
  state.slots[state.activeSlot] = alias || null;
  state.activeCard = null;
  state.filterSource = null;
  state.filterAutomation = null;
  document.getElementById("search").value = "";
  renderRail();
  renderPicker();
  renderCardBrowser();
  clearDetail();
  updateOutput();
  if (alias) checkDeckForMissingCards(DECKS_DATA[alias], activeSlotDef().label);
}

/* ── Card browser (middle panel) ────────────────────────── */
function deckCards() {
  const deck = activeDeck();
  if (!deck) return [];
  const pool = activeCardPool();
  return deck.cardIDs
    .map(id => pool[id] || { alias: id, id: id, name: id, __missing: true })
    .filter(c => !isDeprecated(c));
}

/* How many physical copies of a card exist within THIS deck specifically
   (e.g. Sabotage as sabo1-4) — not a global count, since the same name can
   recur under different aliases across other expansions/decks. */
function deckCopiesMap() {
  const cards = deckCards();
  const nameCounts = {};
  cards.forEach(c => { if (c.name) nameCounts[c.name] = (nameCounts[c.name] || 0) + 1; });
  const map = new Map();
  cards.forEach(c => map.set(c.alias || c.id, c.name ? nameCounts[c.name] : 1));
  return map;
}

function getVisibleCards() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const src = state.filterSource;
  const auto = state.filterAutomation;
  return deckCards().filter(c => {
    if (src && c.source !== src) return false;
    if (auto && c.automation !== auto) return false;
    if (q && !cardSearchText(c).includes(q)) return false;
    return true;
  });
}

function renderFilterBar(allCards) {
  const bar = document.getElementById("filter-bar");
  const sources = [...new Set(allCards.map(c => c.source).filter(Boolean))].sort();
  if (sources.length < 2) { bar.classList.add("hidden"); bar.innerHTML = ""; }
  else {
    bar.classList.remove("hidden");
    const chips = [{ val: null, label: "All" }, ...sources.map(s => ({ val: s, label: s.toUpperCase() }))];
    bar.innerHTML = chips.map(ch =>
      `<span class="chip${state.filterSource === ch.val ? " active" : ""}" data-src="${ch.val ?? ""}">${escHtml(ch.label)}</span>`
    ).join("");
    bar.querySelectorAll(".chip").forEach(el => {
      el.onclick = () => { state.filterSource = el.dataset.src || null; renderCardList(); };
    });
  }

  const autoBar = document.getElementById("filter-bar-automation");
  const hasAutomation = allCards.some(c => c.automation);
  if (!hasAutomation) { autoBar.classList.add("hidden"); autoBar.innerHTML = ""; return; }
  autoBar.classList.remove("hidden");
  const autoChips = [{ val: null, label: "All" }, ...Object.entries(AUTOMATION_LABELS).map(([val, label]) => ({ val, label }))];
  autoBar.innerHTML = autoChips.map(ch =>
    `<span class="chip${state.filterAutomation === ch.val ? " active" : ""}" data-auto="${ch.val ?? ""}">${escHtml(ch.label)}</span>`
  ).join("");
  autoBar.querySelectorAll(".chip").forEach(el => {
    el.onclick = () => { state.filterAutomation = el.dataset.auto || null; renderCardList(); };
  });
}

function renderCardBrowser() {
  const deck = activeDeck();
  document.getElementById("browser-deck-name").textContent = deck ? deck.name : "—";
  renderCardList();
}

function renderCardList() {
  const deck = activeDeck();
  const listEl = document.getElementById("card-list");

  if (!deck) {
    document.getElementById("browser-count").textContent = "";
    document.getElementById("filter-bar").classList.add("hidden");
    listEl.innerHTML = `<div id="mid-empty">Select a deck for this slot from the left panel.</div>`;
    return;
  }

  const allCards = deckCards();
  renderFilterBar(allCards);

  const visible = getVisibleCards();
  const excl = exclSetFor(deck.alias);
  const sel = state.selected || (state.selected = {});
  if (!sel[deck.alias]) sel[deck.alias] = new Set();
  const selSet = sel[deck.alias];
  const copiesMap = deckCopiesMap();

  document.getElementById("browser-count").textContent = `${visible.length} shown · ${excl.size} excluded`;

  if (visible.length === 0) {
    listEl.innerHTML = `<div class="list-empty">No cards match.</div>`;
    return;
  }

  listEl.innerHTML = visible.map(c => {
    const key = c.alias || c.id;
    const isExcl = excl.has(key);
    const isSelChk = selSet.has(key);
    const isAct = key === state.activeCard;
    const copies = copiesMap.get(key) || 1;
    const metaBits = [
      c.source ? c.source.toUpperCase() : "",
      c.automation ? `<span class="auto-${c.automation}">${escHtml(AUTOMATION_LABELS[c.automation] || c.automation)}</span>` : "",
      copies > 1 ? `×${copies} in this deck` : "",
      isExcl ? '<span class="excl-badge">excluded</span>' : "",
    ].filter(Boolean);
    return `<div class="card-item${isExcl ? " excluded" : ""}${isAct ? " active" : ""}" data-key="${escAttr(key)}">
  <input type="checkbox" class="card-cb" data-key="${escAttr(key)}" ${isSelChk ? "checked" : ""} />
  <div class="card-info">
    <div class="card-name">${escHtml(c.name || key)}</div>
    <div class="card-meta">${metaBits.join(" · ")}</div>
  </div>
</div>`;
  }).join("");

  listEl.querySelectorAll(".card-item").forEach(el => {
    el.onclick = (e) => {
      if (e.target.classList.contains("card-cb")) return;
      showDetail(el.dataset.key);
    };
  });
  listEl.querySelectorAll(".card-cb").forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); toggleSelect(el.dataset.key); };
  });
}

function toggleSelect(key) {
  const deck = activeDeck();
  if (!deck) return;
  const sel = state.selected[deck.alias];
  if (sel.has(key)) sel.delete(key); else sel.add(key);
}
function selectAllVisible() {
  const deck = activeDeck();
  if (!deck) return;
  getVisibleCards().forEach(c => state.selected[deck.alias].add(c.alias || c.id));
  renderCardList();
}
function deselectAllVisible() {
  const deck = activeDeck();
  if (!deck) return;
  getVisibleCards().forEach(c => state.selected[deck.alias].delete(c.alias || c.id));
  renderCardList();
}
function excludeSelected() {
  const deck = activeDeck();
  if (!deck) return;
  const sel = state.selected[deck.alias];
  const excl = exclSetFor(deck.alias);
  let n = 0;
  sel.forEach(k => { excl.add(k); n++; });
  sel.clear();
  renderCardList(); renderRail(); updateOutput();
  if (state.activeCard) showDetail(state.activeCard);
  if (n) showToast(`Excluded ${n} card${n !== 1 ? "s" : ""}`);
}
function includeSelected() {
  const deck = activeDeck();
  if (!deck) return;
  const sel = state.selected[deck.alias];
  const excl = exclSetFor(deck.alias);
  let n = 0;
  sel.forEach(k => { if (excl.has(k)) { excl.delete(k); n++; } });
  sel.clear();
  renderCardList(); renderRail(); updateOutput();
  if (state.activeCard) showDetail(state.activeCard);
  if (n) showToast(`Restored ${n} card${n !== 1 ? "s" : ""}`);
}

/* ── Card detail (right panel) ──────────────────────────── */
const FIELD_LABELS = {
  text: "Card Text", text1: "For", text2: "Against", window: "Timing Window",
  mapText: "Map Text", flavorText: "Flavor Text", flavourText: "Flavor Text",
  prerequisites: "Prerequisites", attachmentId: "Attachment ID",
  initials: "Initials", shortName: "Short Name", homebrewReplacesID: "Replaces (Homebrew)",
};
const TAG_FIELDS = ["type", "types", "phase", "target", "resolution", "elect", "points", "faction"];
const HIDDEN_FIELDS = [
  "alias", "id", "name", "deckType", "source", "imageURL", "automationID", "__missing",
  "automation", "timingGroup", "copies", "playTiming", "actualSource",
  "voteType", "agendaType", "relicActionType", "isFakeRelic", "relicKind", "soPhase", "poStage", "poPhase",
];

function showDetail(key) {
  state.activeCard = key;
  const deck = activeDeck();
  const pool = activeCardPool();
  const card = pool[key];

  document.getElementById("detail-empty").style.display = "none";
  document.getElementById("detail-card").style.display = "block";

  const excl = exclSetFor(deck.alias);
  const isExcl = excl.has(key);

  if (!card) {
    document.getElementById("detail-title").textContent = key;
    document.getElementById("detail-tags").innerHTML = `<span class="tag">missing card data</span>`;
    document.getElementById("detail-img").style.display = "none";
    document.getElementById("detail-fields").innerHTML = `<p style="color:var(--text-dim)">This alias is listed in the deck but no matching card definition was found in the synced data.</p>`;
    document.getElementById("detail-id").textContent = key;
  } else {
    document.getElementById("detail-title").textContent = card.name || key;

    const tags = [`<span class="tag accent">${escHtml(activeSlotDef().label)}</span>`];
    if (card.source) tags.push(`<span class="tag">${escHtml(card.source.toUpperCase())}</span>`);
    if (card.automation) tags.push(`<span class="tag tag-${card.automation}">${escHtml(AUTOMATION_LABELS[card.automation] || card.automation)}</span>`);
    if (card.timingGroup) tags.push(`<span class="tag">${escHtml(card.timingGroup.replace(/_/g, " "))}</span>`);
    const copies = deckCopiesMap().get(key) || 1;
    if (copies > 1) tags.push(`<span class="tag">×${copies} copies in this deck</span>`);
    if (card.relicKind === "fragment") tags.push(`<span class="tag">Fragment (not a relic card)</span>`);
    else if (card.relicActionType) tags.push(`<span class="tag">${escHtml(card.relicActionType.replace(/_/g, " "))}</span>`);
    TAG_FIELDS.forEach(f => {
      if (card[f] === undefined || card[f] === null) return;
      const v = Array.isArray(card[f]) ? card[f].join(", ") : String(card[f]);
      if (!v) return;
      const label = f === "points" ? `${v} pt` : v.replace(/_/g, " ");
      tags.push(`<span class="tag">${escHtml(label)}</span>`);
    });
    document.getElementById("detail-tags").innerHTML = tags.join("");

    const imgEl = document.getElementById("detail-img");
    if (card.imageURL) { imgEl.src = card.imageURL; imgEl.style.display = ""; }
    else { imgEl.style.display = "none"; }

    const order = ["text", "text1", "text2", "window", "mapText", "flavorText", "flavourText", "prerequisites", "attachmentId", "shortName", "initials", "homebrewReplacesID"];
    const skip = new Set([...HIDDEN_FIELDS, ...TAG_FIELDS]);
    const fieldsHtml = [];
    const seen = new Set();
    order.forEach(f => {
      if (card[f] === undefined || card[f] === null || card[f] === "") return;
      seen.add(f);
      fieldsHtml.push(renderField(f, card[f]));
    });
    Object.keys(card).forEach(f => {
      if (seen.has(f) || skip.has(f) || card[f] === undefined || card[f] === null || card[f] === "") return;
      fieldsHtml.push(renderField(f, card[f]));
    });
    document.getElementById("detail-fields").innerHTML = fieldsHtml.join("");
    document.getElementById("detail-id").textContent = card.alias || card.id || key;
  }

  const btn = document.getElementById("detail-excl-btn");
  if (isExcl) { btn.textContent = "✓ Restore card"; btn.classList.add("excluded"); }
  else { btn.textContent = "✕ Exclude card"; btn.classList.remove("excluded"); }

  document.querySelectorAll(".card-item").forEach(el => el.classList.toggle("active", el.dataset.key === key));
}

function renderField(name, value) {
  const label = FIELD_LABELS[name] || name.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());
  const isFlavor = name === "flavorText" || name === "flavourText";
  const text = Array.isArray(value) ? value.join(", ") : String(value);
  return `<div class="detail-section">
    <div class="detail-label">${escHtml(label)}</div>
    <div class="detail-box${isFlavor ? " flavor" : ""}">${escHtml(text)}</div>
  </div>`;
}

function clearDetail() {
  state.activeCard = null;
  document.getElementById("detail-empty").style.display = "flex";
  document.getElementById("detail-card").style.display = "none";
}

function toggleExclude(key) {
  const deck = activeDeck();
  if (!key || !deck) return;
  const excl = exclSetFor(deck.alias);
  if (excl.has(key)) excl.delete(key); else excl.add(key);
  renderCardList();
  if (state.activeCard === key) showDetail(key);
  renderRail();
  updateOutput();
}

/* ── Output / export ────────────────────────────────────── */
function buildCommand() {
  const parts = ["/game set_deck"];
  SLOTS.forEach(s => {
    const alias = state.slots[s.key];
    if (alias) parts.push(`${s.param}:${alias}`);
  });
  return parts.length > 1 ? parts.join(" ") : "";
}

/* deck.type -> per-card removal command builder. Technology and events
   have no equivalent bot command yet. */
const REMOVE_CMD_BUILDERS = {
  action_card:               id => `/custom remove_ac_from_game ac_id:${id}`,
  agenda:                    id => `/custom remove_agenda_from_game agenda_id:${id}`,
  relic:                     id => `/custom remove_relic_from_game relic_id:${id}`,
  secret_objective:          id => `/custom remove_so_from_game so_id:${id}`,
  public_stage_1_objective:  id => `/custom remove_po_from_game public_id:${id}`,
  public_stage_2_objective:  id => `/custom remove_po_from_game public_id:${id}`,
  explore:                   id => `/explore remove explore_card_id:${id}`,
};

function collectRemovalLines() {
  const lines = [];
  SLOTS.forEach(s => {
    const alias = state.slots[s.key];
    if (!alias) return;
    const deck = DECKS_DATA[alias];
    const excl = state.exclusions[alias];
    if (!deck || !excl || excl.size === 0) return;
    const builder = REMOVE_CMD_BUILDERS[deck.type];
    [...excl].sort().forEach(cardId => {
      lines.push(builder
        ? { text: builder(cardId), copyable: true }
        : { text: `# ${s.label}: ${cardId} — no removal command yet, exclude manually`, copyable: false });
    });
  });
  return lines;
}

function configuredCount() {
  return VISIBLE_SLOTS.filter(s => state.slots[s.key]).length;
}
function totalExclusions() {
  return Object.values(state.exclusions).reduce((sum, set) => sum + set.size, 0);
}

function updateOutput() {
  const cmd = buildCommand();
  document.getElementById("output-cmd").textContent = cmd;

  const removalLines = collectRemovalLines();
  document.getElementById("output-removals").innerHTML = removalLines
    .map(l => `<div class="removal-line${l.copyable ? "" : " no-command"}">${escHtml(l.text)}</div>`)
    .join("");

  const cfg = configuredCount();
  const excl = totalExclusions();
  document.getElementById("output-summary").textContent =
    `${cfg}/${VISIBLE_SLOTS.length} slots configured` + (excl ? ` · ${excl} card${excl !== 1 ? "s" : ""} excluded` : "");
  document.getElementById("output-meta").textContent = removalLines.some(l => !l.copyable)
    ? "Some excluded cards have no /custom removal command yet (technology, events) — exclude those manually when registering the deck."
    : "";
  document.getElementById("output-pulse").classList.toggle("hidden", state.outputOpen || cfg === 0);
  persistToLocalStorage();
}

function toggleOutput() {
  state.outputOpen = !state.outputOpen;
  document.getElementById("output-bar").classList.toggle("open", state.outputOpen);
  document.getElementById("output-pulse").classList.toggle("hidden", state.outputOpen || configuredCount() === 0);
}
function copyBotCommand() {
  const cmd = buildCommand();
  if (!cmd) { showToast("Configure at least one slot first"); return; }
  navigator.clipboard.writeText(cmd).then(() => showToast("Command copied!"));
}
function copyRemovalCommands() {
  const lines = collectRemovalLines().filter(l => l.copyable).map(l => l.text);
  if (!lines.length) { showToast("No removal commands to copy"); return; }
  navigator.clipboard.writeText(lines.join("\n")).then(() => showToast(`Copied ${lines.length} removal command${lines.length !== 1 ? "s" : ""}!`));
}
function downloadFilteredDeck() {
  const deck = activeDeck();
  if (!deck) { showToast("Select a deck for the active slot first"); return; }
  const excl = exclSetFor(deck.alias);
  const filtered = { ...deck, cardIDs: deck.cardIDs.filter(id => !excl.has(id)) };
  const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = deck.alias + "_filtered.json";
  a.click();
  showToast("Download started");
}
function clearActiveDeckExclusions() {
  const deck = activeDeck();
  if (!deck) return;
  state.exclusions[deck.alias] = new Set();
  renderCardList(); renderRail(); updateOutput();
  if (state.activeCard) showDetail(state.activeCard);
  showToast("Exclusions cleared for this slot's deck");
}
function resetAll() {
  SLOTS.forEach(s => state.slots[s.key] = null);
  state.exclusions = {};
  state.selected = {};
  state.activeCard = null;
  document.getElementById("search").value = "";
  renderRail(); renderPicker(); renderCardBrowser(); clearDetail(); updateOutput();
  showToast("All slots reset");
}

initResizeHandle("resize-handle", "panel-left", 220, 620);
initResizeHandle("resize-handle2", "panel-mid", 220, 620);
