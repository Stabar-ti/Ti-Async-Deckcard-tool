/* ── Shared UI helpers used by both the editor and the deck builder ───── */

/* ── Escape utilities ─────────────────────────────────────── */
function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(s) { return String(s ?? "").replace(/'/g, "\\'"); }

/* ── Toast ───────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 2400);
}

/* ── Full-text card search ───────────────────────────────────
   Used by both the editor's card browser and the deck builder's card
   picker — searches every string/number/array field on a card object. */

/* Cards sourced "deprecated" are kept in the synced data for historical
   reference but should never surface in the editor or the deck builder. */
function isDeprecated(card) {
  return !!card && (card.source || "").toLowerCase() === "deprecated";
}

const SEARCH_CACHE = new WeakMap();
function cardSearchText(c) {
  if (SEARCH_CACHE.has(c)) return SEARCH_CACHE.get(c);
  const parts = [];
  Object.entries(c).forEach(([k, v]) => {
    if (k === "deckType" || k === "imageURL") return;
    if (typeof v === "string") parts.push(v);
    else if (typeof v === "number") parts.push(String(v));
    else if (Array.isArray(v)) parts.push(v.join(" "));
  });
  const text = parts.join(" ").toLowerCase();
  SEARCH_CACHE.set(c, text);
  return text;
}

/* ── Page-level UI state: which tab is active, and the issues banner ─── */
const uiState = {
  mode: "editor",
  issues: [],
  issuesOpen: false,
};

function switchMode(mode) {
  uiState.mode = mode;
  document.querySelectorAll(".mode-tab").forEach(el => el.classList.toggle("active", el.dataset.mode === mode));
  document.getElementById("rail").style.display = mode === "editor" ? "flex" : "none";
  document.getElementById("main").style.display = mode === "editor" ? "flex" : "none";
  document.getElementById("builder-main").style.display = mode === "builder" ? "flex" : "none";
  ["btn-save-config", "btn-load-config", "btn-reset-all"].forEach(id => {
    document.getElementById(id).style.display = mode === "editor" ? "" : "none";
  });
  if (mode === "builder") renderBuilder();
}

/* ── Issues banner (missing decks/cards) ─────────────────── */
function addIssue(msg) {
  if (!uiState.issues.includes(msg)) uiState.issues.push(msg);
  renderIssues();
}
function clearIssues() {
  uiState.issues = [];
  renderIssues();
}
function dismissIssues(e) {
  e.stopPropagation();
  clearIssues();
}
function toggleIssues() {
  uiState.issuesOpen = !uiState.issuesOpen;
  renderIssues();
}
function renderIssues() {
  const banner = document.getElementById("issues-banner");
  if (uiState.issues.length === 0) { banner.classList.add("hidden"); return; }
  banner.classList.remove("hidden");
  banner.classList.toggle("open", uiState.issuesOpen);
  document.getElementById("issues-summary").textContent =
    `${uiState.issues.length} issue${uiState.issues.length !== 1 ? "s" : ""} found — some decks/cards in your saved config or the stock data are out of date`;
  document.getElementById("issues-body").innerHTML = uiState.issues.map(m => `<div class="issue-line">${escHtml(m)}</div>`).join("");
}

/* ── Resize handles (editor's left/mid panels) ───────────── */
function initResizeHandle(handleId, panelId, min, max) {
  const handle = document.getElementById(handleId);
  const panel = document.getElementById(panelId);
  let dragging = false;
  handle.addEventListener("mousedown", e => {
    dragging = true;
    handle.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const rect = panel.parentElement.getBoundingClientRect();
    let w = e.clientX - rect.left;
    for (let el = panel.previousElementSibling; el; el = el.previousElementSibling) {
      w -= el.getBoundingClientRect().width;
    }
    w = Math.max(min, Math.min(max, w));
    panel.style.width = w + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
}
