/* ── Card Maker ────────────────────────────────────────────
   Lets a user design individual cards (not decks) for any of the 7 card
   types, offering every field documented in
   .claude/AC_TAG_DERIVATION_SPEC.md and .claude/NONAC_TAG_DERIVATION_SPEC.md,
   and downloads them grouped by type as plain JSON arrays — the exact
   shape of the bot's data/<type>/*.json files (e.g. action_cards.json is
   `[{...}, {...}]`, not wrapped or keyed by alias).

   One card is designed at a time in the form; "Add to batch" commits it,
   and the batch can mix card types freely (each gets its own download
   file, grouped by type, since the bot keeps per-type files).

   Depends on globals defined in main.js (CARDS) and ui.js (escHtml,
   escAttr, showToast). */

/* type -> { label, keyField, fileBase, fields[] }. Field order matches the
   real upstream sample objects field-for-field where one exists, so
   buildCardObject()'s output key order mirrors the bot's own files.

   `required: true` is set only on fields that are present on 100% of the
   live synced cards of that type (verified against public/data/cards/*.js,
   excluding our own sync-time-derived fields like `automation`) — i.e.
   fields the bot's own data never actually omits, not just the ones that
   feel obviously necessary. */
const CARD_MAKER_TYPES = {
  action_card: {
    label: "Action Cards",
    keyField: "alias",
    fileBase: "action_cards",
    fields: [
      { key: "alias", label: "Alias (unique ID)", type: "text", required: true, placeholder: "my_custom_card" },
      { key: "name", label: "Name", type: "text", required: true, placeholder: "My Custom Card" },
      { key: "phase", label: "Phase", type: "select", required: true, options: ["", "Action", "Agenda", "Strategy", "Status", "Any"] },
      { key: "window", label: "Window (timing text)", type: "text", required: true, placeholder: "e.g. After another player plays an action card" },
      { key: "text", label: "Card Text", type: "textarea", required: true },
      { key: "notes", label: "Notes", type: "textarea" },
      { key: "flavorText", label: "Flavor Text", type: "textarea" },
      {
        key: "automationID", label: "Automation ID (advanced — overrides alias for bot handler lookup)", type: "text",
        hint: "Leave this blank if you're not sure. It only matters if you're wiring this card to an existing bot automation handler by hand — set incorrectly, it silently attaches your card to the wrong automated effect. The bot falls back to the alias when this is empty.",
      },
      { key: "playTiming", label: "Play Timing", type: "select", options: ["", "AGENDA_AFTER", "AGENDA_WHEN"] },
      { key: "source", label: "Source", type: "text", required: true, placeholder: "homebrew" },
      { key: "actualSource", label: "Actual Source (overrides source for display)", type: "text" },
      { key: "affectedByWildWildGalaxy", label: "Affected by Wild Wild Galaxy", type: "checkbox" },
      { key: "wildWildText", label: "Wild Wild Galaxy Text", type: "textarea" },
      { key: "wildWildWindow", label: "Wild Wild Galaxy Window", type: "text" },
    ],
  },
  agenda: {
    label: "Agendas",
    keyField: "alias",
    fileBase: "agendas",
    fields: [
      { key: "alias", label: "Alias (unique ID)", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "type", label: "Type", type: "select", required: true, options: ["", "Law", "Directive", "Agenda Phase"] },
      { key: "target", label: "Target", type: "text", placeholder: "For/Against, Elect Player, Elect Planet, …" },
      { key: "text1", label: "Text 1 (For / primary effect)", type: "textarea" },
      { key: "text2", label: "Text 2 (Against)", type: "textarea" },
      { key: "mapText", label: "Map Text (short reminder shown on map)", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "categoryDescription", label: "Category Description", type: "text" },
      { key: "forEmoji", label: "For Emoji", type: "text" },
      { key: "againstEmoji", label: "Against Emoji", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
      { key: "source", label: "Source", type: "text", required: true, placeholder: "homebrew" },
    ],
  },
  relic: {
    label: "Relics",
    keyField: "alias",
    fileBase: "relics",
    fields: [
      { key: "alias", label: "Alias (unique ID)", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "text", label: "Card Text", type: "textarea", required: true },
      { key: "source", label: "Source", type: "text", required: true, placeholder: "homebrew" },
      { key: "flavourText", label: "Flavour Text", type: "textarea" },
      { key: "imageURL", label: "Image URL", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
      { key: "shortName", label: "Short Name", type: "text" },
      { key: "shrinkName", label: "Shrink Name (display hint)", type: "checkbox" },
      { key: "homebrewReplacesID", label: "Replaces (Homebrew ID)", type: "text" },
      { key: "isFakeRelic", label: "Is Fake Relic (explore fragment, not a real relic card)", type: "checkbox" },
      { key: "actualSource", label: "Actual Source (overrides source for display)", type: "text" },
    ],
  },
  explore: {
    label: "Exploration",
    keyField: "id",
    fileBase: "explores",
    fields: [
      { key: "id", label: "ID (unique — explore cards use id, not alias)", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "type", label: "Type", type: "select", required: true, options: ["", "Cultural", "Hazardous", "Industrial", "Frontier"] },
      { key: "resolution", label: "Resolution", type: "select", required: true, options: ["", "Instant", "Fragment", "Attach", "Leader", "Token"] },
      { key: "text", label: "Card Text", type: "textarea", required: true },
      { key: "attachmentId", label: "Attachment ID", type: "text" },
      { key: "flavorText", label: "Flavor Text", type: "textarea" },
      { key: "notes", label: "Notes", type: "textarea" },
      { key: "source", label: "Source", type: "text", required: true, placeholder: "homebrew" },
    ],
  },
  technology: {
    label: "Technology",
    keyField: "alias",
    fileBase: "technologies",
    fields: [
      { key: "alias", label: "Alias (unique ID)", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "types", label: "Types", type: "array", required: true, placeholder: "PROPULSION, BIOTIC, CYBERNETIC, WARFARE, or UNITUPGRADE" },
      { key: "requirements", label: "Requirements (prereq resource icons, e.g. \"BB\")", type: "text", placeholder: "e.g. BB, GY — letters are resource-icon shorthand, not tech aliases" },
      { key: "faction", label: "Faction (if a faction tech)", type: "text" },
      { key: "baseUpgrade", label: "Base Upgrade (alias of the tech this upgrades)", type: "text" },
      { key: "source", label: "Source", type: "text", required: true, placeholder: "homebrew" },
      { key: "text", label: "Card Text", type: "textarea", required: true },
      { key: "homebrewReplacesID", label: "Replaces (Homebrew ID)", type: "text" },
      { key: "imageURL", label: "Image URL", type: "text" },
      { key: "initials", label: "Initials", type: "text" },
      { key: "shortName", label: "Short Name", type: "text" },
      { key: "isUpgrade", label: "Is Upgrade", type: "checkbox" },
    ],
  },
  secret_objective: {
    label: "Secret Objectives",
    keyField: "alias",
    fileBase: "secret_objectives",
    fields: [
      { key: "alias", label: "Alias (unique ID)", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "phase", label: "Phase", type: "select", required: true, options: ["", "Action", "Status", "Agenda", "Strategy"] },
      { key: "text", label: "Card Text", type: "textarea", required: true },
      { key: "points", label: "Points", type: "number", required: true, placeholder: "1" },
      { key: "notes", label: "Notes", type: "textarea" },
      { key: "source", label: "Source", type: "text", required: true, placeholder: "homebrew" },
      { key: "homebrewReplacesID", label: "Replaces (Homebrew ID)", type: "text" },
    ],
  },
  public_objective: {
    label: "Public Objectives",
    keyField: "alias",
    fileBase: "public_objectives",
    fields: [
      { key: "alias", label: "Alias (unique ID)", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "phase", label: "Phase", type: "select", options: ["", "Status", "Omega", "Action Phase"] },
      { key: "text", label: "Card Text", type: "textarea", required: true },
      { key: "points", label: "Points (1 = Stage I, 2 = Stage II)", type: "number", required: true, placeholder: "1" },
      { key: "notes", label: "Notes", type: "textarea" },
      { key: "source", label: "Source", type: "text", required: true, placeholder: "homebrew" },
      { key: "homebrewReplacesID", label: "Replaces (Homebrew ID)", type: "text" },
    ],
  },
};

const CARDMAKER_STORAGE_KEY = "ti4_card_maker_draft_v1";

const cardMakerState = {
  type: "action_card",
  fields: {},
  batch: [],   // committed cards: { type, fields }
};

/* ── Mobile tab navigation (Form / Preview / Batch) ─────────
   Scoped to #cardmaker-mobile-tabs so it doesn't fight the deck builder's
   own .mtab group (setBuilderView is scoped to #builder-mobile-tabs). */
function setCardMakerView(view) {
  document.getElementById("cardmaker-main").dataset.view = view;
  document.querySelectorAll("#cardmaker-mobile-tabs .mtab").forEach(el => el.classList.toggle("active", el.dataset.view === view));
}

function populateCardMakerTypeSelect() {
  const sel = document.getElementById("cardmaker-type");
  sel.innerHTML = Object.entries(CARD_MAKER_TYPES).map(([type, cfg]) =>
    `<option value="${type}"${type === cardMakerState.type ? " selected" : ""}>${escHtml(cfg.label)}</option>`
  ).join("");
}

function onCardMakerTypeChange() {
  const newType = document.getElementById("cardmaker-type").value;
  if (newType !== cardMakerState.type && Object.keys(cardMakerState.fields).length) {
    showToast("Fields cleared — card type changed");
  }
  cardMakerState.type = newType;
  cardMakerState.fields = {};
  renderCardMaker();
  persistCardMakerDraft();
}

function renderCardMakerFieldInput(f) {
  const val = cardMakerState.fields[f.key] ?? (f.type === "checkbox" ? false : "");
  const reqMark = f.required ? ' <span style="color:var(--danger)">*</span>' : "";
  let inputHtml;
  if (f.type === "textarea") {
    inputHtml = `<textarea id="cm-${f.key}" class="modal-input" rows="3" placeholder="${escAttr(f.placeholder || "")}">${escHtml(val)}</textarea>`;
  } else if (f.type === "select") {
    inputHtml = `<select id="cm-${f.key}" class="modal-input">` +
      f.options.map(o => `<option value="${escAttr(o)}"${o === val ? " selected" : ""}>${escHtml(o || "—")}</option>`).join("") +
      `</select>`;
  } else if (f.type === "checkbox") {
    inputHtml = `<input id="cm-${f.key}" type="checkbox" ${val ? "checked" : ""} />`;
  } else if (f.type === "number") {
    inputHtml = `<input id="cm-${f.key}" class="modal-input" type="number" value="${escAttr(val)}" placeholder="${escAttr(f.placeholder || "")}" />`;
  } else if (f.type === "array") {
    const display = Array.isArray(val) ? val.join(", ") : val;
    inputHtml = `<input id="cm-${f.key}" class="modal-input" type="text" value="${escAttr(display)}" placeholder="${escAttr(f.placeholder || "comma-separated")}" />`;
  } else {
    inputHtml = `<input id="cm-${f.key}" class="modal-input" type="text" value="${escAttr(val)}" placeholder="${escAttr(f.placeholder || "")}" />`;
  }
  const fieldClass = f.type === "checkbox" ? "builder-field builder-field-checkbox" : "builder-field";
  const hintHtml = f.hint ? `<div class="field-hint">${escHtml(f.hint)}</div>` : "";
  return `<label class="${fieldClass}">
    <span class="builder-label">${escHtml(f.label)}${reqMark}</span>
    ${inputHtml}
  </label>${hintHtml}`;
}

function renderCardMakerForm() {
  const cfg = CARD_MAKER_TYPES[cardMakerState.type];
  document.getElementById("cardmaker-form").innerHTML = cfg.fields.map(renderCardMakerFieldInput).join("");
  cfg.fields.forEach(f => {
    const el = document.getElementById(`cm-${f.key}`);
    el.addEventListener(f.type === "checkbox" ? "change" : "input", onCardMakerFieldInput);
  });
}

function onCardMakerFieldInput() {
  const cfg = CARD_MAKER_TYPES[cardMakerState.type];
  cfg.fields.forEach(f => {
    const el = document.getElementById(`cm-${f.key}`);
    if (!el) return;
    cardMakerState.fields[f.key] = f.type === "checkbox" ? el.checked : el.value;
  });
  renderCardMakerValidation();
  renderCardMakerPreview();
  renderCardMakerJsonPreview();
  persistCardMakerDraft();
}

/* Builds the actual JSON-ready object for a (type, fields) pair, applying
   the same conventions the bot's own data uses: checkboxes serialize as a
   real JSON boolean (`true`) and are omitted entirely when false/unset —
   verified against the live synced data (e.g. isFakeRelic, shrinkName,
   affectedByWildWildGalaxy, isUpgrade are all JSON `true`, never the
   string "True", and simply absent rather than `false`). Empty optional
   fields are omitted rather than written as "". */
function buildCardObject(type, fields) {
  const cfg = CARD_MAKER_TYPES[type];
  const obj = {};
  cfg.fields.forEach(f => {
    const raw = fields[f.key];
    if (f.type === "checkbox") {
      if (raw) obj[f.key] = true;
      return;
    }
    if (f.type === "array") {
      const arr = (raw || "").toString().split(",").map(s => s.trim()).filter(Boolean);
      if (arr.length) obj[f.key] = arr;
      return;
    }
    if (f.type === "number") {
      const s = (raw ?? "").toString().trim();
      if (s !== "" && !Number.isNaN(Number(s))) obj[f.key] = Number(s);
      return;
    }
    const s = (raw ?? "").toString().trim();
    if (s !== "") obj[f.key] = s;
  });
  return obj;
}
function buildCurrentCardObject() {
  return buildCardObject(cardMakerState.type, cardMakerState.fields);
}

function validateCurrentCard() {
  const errors = [];
  const cfg = CARD_MAKER_TYPES[cardMakerState.type];
  const keyLabel = cfg.keyField === "id" ? "ID" : "Alias";
  const keyVal = (cardMakerState.fields[cfg.keyField] || "").toString().trim();
  if (!keyVal) {
    errors.push(`${keyLabel} is required.`);
  } else {
    const pool = CARDS[cardMakerState.type] || {};
    if (pool[keyVal]) errors.push(`"${keyVal}" already exists in the synced card data — choose a unique ${keyLabel.toLowerCase()}.`);
    if (cardMakerState.batch.some(c => c.type === cardMakerState.type && (c.fields[cfg.keyField] || "").toString().trim() === keyVal)) {
      errors.push(`"${keyVal}" is already used by another ${cfg.label} card in this batch.`);
    }
  }
  // Every other field marked required: true is required on 100% of the live
  // synced cards of this type — not just alias/name (see CARD_MAKER_TYPES comment).
  cfg.fields.forEach(f => {
    if (!f.required || f.key === cfg.keyField) return;
    const v = cardMakerState.fields[f.key];
    if (!(v ?? "").toString().trim()) errors.push(`${f.label} is required.`);
  });
  return errors;
}

function renderCardMakerValidation() {
  const errors = validateCurrentCard();
  const el = document.getElementById("cardmaker-validation");
  el.innerHTML = errors.length
    ? errors.map(e => `<div class="validation-error">⚠ ${escHtml(e)}</div>`).join("")
    : `<div class="validation-ok">✓ Ready to add to batch</div>`;
}

/* ── Live preview (reuses the editor's detail-panel look) ───────────── */
function renderCardMakerPreview() {
  const cfg = CARD_MAKER_TYPES[cardMakerState.type];
  const obj = buildCurrentCardObject();

  document.getElementById("cardmaker-preview-title").textContent = obj.name || obj[cfg.keyField] || "(untitled card)";

  const tags = [`<span class="tag accent">${escHtml(cfg.label)}</span>`];
  cfg.fields.forEach(f => {
    if (f.key === cfg.keyField || f.key === "name") return;
    if (f.type === "select" || f.type === "number") {
      const v = obj[f.key];
      if (v !== undefined && v !== "") tags.push(`<span class="tag">${escHtml(String(v))}</span>`);
    } else if (f.type === "checkbox" && obj[f.key]) {
      tags.push(`<span class="tag">${escHtml(f.label)}</span>`);
    } else if (f.type === "array" && obj[f.key]) {
      tags.push(`<span class="tag">${escHtml(obj[f.key].join(", "))}</span>`);
    }
  });
  document.getElementById("cardmaker-preview-tags").innerHTML = tags.join("");

  const boxes = [];
  cfg.fields.forEach(f => {
    if (f.type !== "textarea") return;
    const v = obj[f.key];
    if (!v) return;
    boxes.push(`<div class="detail-section">
      <div class="detail-label">${escHtml(f.label)}</div>
      <div class="detail-box">${escHtml(v)}</div>
    </div>`);
  });
  document.getElementById("cardmaker-preview-fields").innerHTML = boxes.length
    ? boxes.join("")
    : `<p style="color:var(--text-dim)">Fill in the form to preview the card.</p>`;
  document.getElementById("cardmaker-preview-id").textContent = obj[cfg.keyField] || "—";
}

/* ── Batch (the cards already committed, possibly mixed types) ──────── */
function addCurrentCardToBatch() {
  const errors = validateCurrentCard();
  if (errors.length) {
    showToast(errors[0]);
    return;
  }
  const cfg = CARD_MAKER_TYPES[cardMakerState.type];
  const nameVal = cardMakerState.fields.name;
  cardMakerState.batch.push({ type: cardMakerState.type, fields: { ...cardMakerState.fields } });
  cardMakerState.fields = {};
  renderCardMaker();
  persistCardMakerDraft();
  showToast(`Added "${nameVal}" to batch (${cardMakerState.batch.length} card${cardMakerState.batch.length !== 1 ? "s" : ""} so far)`);
}

function editBatchItem(index) {
  const [item] = cardMakerState.batch.splice(index, 1);
  if (!item) return;
  cardMakerState.type = item.type;
  cardMakerState.fields = { ...item.fields };
  renderCardMaker();
  persistCardMakerDraft();
}

function removeBatchItem(index) {
  const [removed] = cardMakerState.batch.splice(index, 1);
  renderBatchList();
  renderCardMakerJsonPreview();
  persistCardMakerDraft();
  if (removed) showToast(`Removed "${removed.fields.name || ""}" from batch`);
}

function renderBatchList() {
  document.getElementById("cardmaker-batch-count").textContent = cardMakerState.batch.length;
  const listEl = document.getElementById("cardmaker-batch-list");
  if (cardMakerState.batch.length === 0) {
    listEl.innerHTML = `<div class="list-empty">No cards added yet — design one on the left, then "Add to batch".</div>`;
    return;
  }
  listEl.innerHTML = cardMakerState.batch.map((item, i) => {
    const cfg = CARD_MAKER_TYPES[item.type];
    const keyVal = item.fields[cfg.keyField] || "";
    return `<div class="bundle-item">
  <span class="sel-name">${escHtml(item.fields.name || keyVal)}</span>
  <span class="sel-meta">${escHtml(cfg.label)} · <span class="mono">${escHtml(keyVal)}</span></span>
  <button class="bundle-edit" data-index="${i}" title="Edit">✎</button>
  <button class="bundle-remove" data-index="${i}" title="Remove">✕</button>
</div>`;
  }).join("");
  listEl.querySelectorAll(".bundle-edit").forEach(el => {
    el.onclick = () => editBatchItem(Number(el.dataset.index));
  });
  listEl.querySelectorAll(".bundle-remove").forEach(el => {
    el.onclick = () => removeBatchItem(Number(el.dataset.index));
  });
}

function renderCardMakerJsonPreview() {
  const byType = {};
  cardMakerState.batch.forEach(item => {
    (byType[item.type] = byType[item.type] || []).push(buildCardObject(item.type, item.fields));
  });
  const preview = {};
  Object.entries(byType).forEach(([type, cards]) => {
    preview[`${CARD_MAKER_TYPES[type].fileBase}_custom.json`] = cards;
  });
  document.getElementById("cardmaker-json-preview").textContent = JSON.stringify(preview, null, 2);
}

/* Final sweep across the WHOLE committed batch, independent of the
   per-keystroke check in validateCurrentCard(). That check only ever sees
   one in-progress card against the rest of the batch; this catches
   anything that could still slip through — e.g. a batch restored from an
   older localStorage draft that predates a sync, or duplicate keys within
   the batch itself (case-sensitive exact match, matching how the bot's
   own Java lookups work — "Foo" and "foo" are NOT a collision there). */
function findBatchUniquenessIssues() {
  const issues = [];
  const seenInBatch = {}; // type -> Set of key values already seen
  cardMakerState.batch.forEach((item, i) => {
    const cfg = CARD_MAKER_TYPES[item.type];
    const keyLabel = cfg.keyField === "id" ? "ID" : "alias";
    const keyVal = (item.fields[cfg.keyField] || "").toString().trim();
    const label = item.fields.name || `(unnamed card #${i + 1})`;
    if (!keyVal) {
      issues.push(`"${label}" (${cfg.label}) is missing its ${keyLabel} — remove or fix it before downloading.`);
      return;
    }
    const seen = seenInBatch[item.type] || (seenInBatch[item.type] = new Set());
    if (seen.has(keyVal)) {
      issues.push(`Duplicate ${keyLabel} "${keyVal}" appears on more than one ${cfg.label} card in this batch.`);
    }
    seen.add(keyVal);
    const pool = CARDS[item.type] || {};
    if (pool[keyVal]) {
      issues.push(`"${keyVal}" (${cfg.label}) already exists in the synced card data.`);
    }
  });
  return issues;
}

function downloadCardMakerBatch() {
  if (cardMakerState.batch.length === 0) {
    showToast("Add at least one card to the batch first");
    return;
  }
  const issues = findBatchUniquenessIssues();
  if (issues.length) {
    issues.forEach(addIssue);
    showToast(`Found ${issues.length} uniqueness problem${issues.length !== 1 ? "s" : ""} — see the warning banner above, download cancelled`);
    return;
  }
  const byType = {};
  cardMakerState.batch.forEach(item => {
    (byType[item.type] = byType[item.type] || []).push(buildCardObject(item.type, item.fields));
  });
  Object.entries(byType).forEach(([type, cards]) => {
    const cfg = CARD_MAKER_TYPES[type];
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${cfg.fileBase}_custom.json`;
    a.click();
  });
  showToast(`Downloaded ${Object.keys(byType).length} file${Object.keys(byType).length !== 1 ? "s" : ""} covering ${cardMakerState.batch.length} card${cardMakerState.batch.length !== 1 ? "s" : ""}`);
}

function resetCardMaker() {
  cardMakerState.fields = {};
  cardMakerState.batch = [];
  renderCardMaker();
  persistCardMakerDraft();
  showToast("Card Maker cleared");
}

function renderCardMaker() {
  populateCardMakerTypeSelect();
  renderCardMakerForm();
  renderCardMakerValidation();
  renderCardMakerPreview();
  renderBatchList();
  renderCardMakerJsonPreview();
}

function persistCardMakerDraft() {
  try { localStorage.setItem(CARDMAKER_STORAGE_KEY, JSON.stringify(cardMakerState)); }
  catch (e) { /* storage unavailable — not fatal */ }
}
function loadCardMakerDraft() {
  try {
    const raw = localStorage.getItem(CARDMAKER_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(cardMakerState, {
      type: data.type && CARD_MAKER_TYPES[data.type] ? data.type : "action_card",
      fields: data.fields && typeof data.fields === "object" ? data.fields : {},
      batch: Array.isArray(data.batch) ? data.batch : [],
    });
  } catch (e) { /* corrupt/old draft — ignore */ }
}
