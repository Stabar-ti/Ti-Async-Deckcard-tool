/* ── Data layer + app entry point ─────────────────────────
   Merges the synced public/data/*.js bundles into the two globals every
   other module reads (DECKS_DATA, CARDS), defines the shared deck-type ->
   card-pool lookup, and kicks off the app once the DOM is ready.

   Must load after the data bundles (decks.js, cards/*.js) and after
   ui.js / deck-editor.js / deck-builder.js, since init() calls into all
   three of them. */

/* ── Guard against missing/not-yet-synced data bundles ────── */
const DECKS_DATA = (typeof DECKS !== "undefined") ? DECKS : {};
const CARDS = {
  action_card:       (typeof CARDS_ACTION_CARDS      !== "undefined") ? CARDS_ACTION_CARDS      : {},
  agenda:             (typeof CARDS_AGENDAS           !== "undefined") ? CARDS_AGENDAS           : {},
  relic:              (typeof CARDS_RELICS            !== "undefined") ? CARDS_RELICS            : {},
  explore:            (typeof CARDS_EXPLORES          !== "undefined") ? CARDS_EXPLORES          : {},
  technology:         (typeof CARDS_TECHNOLOGIES      !== "undefined") ? CARDS_TECHNOLOGIES      : {},
  secret_objective:   (typeof CARDS_SECRET_OBJECTIVES !== "undefined") ? CARDS_SECRET_OBJECTIVES : {},
  public_objective:   (typeof CARDS_PUBLIC_OBJECTIVES !== "undefined") ? CARDS_PUBLIC_OBJECTIVES : {},
  event:              (typeof CARDS_EVENTS            !== "undefined") ? CARDS_EVENTS            : {},
};

/* deck.type -> which CARDS pool to look cards up in. Shared by the editor
   and the deck builder. */
const CARD_POOL_FOR_DECKTYPE = {
  action_card: "action_card",
  agenda: "agenda",
  relic: "relic",
  explore: "explore",
  technology: "technology",
  secret_objective: "secret_objective",
  public_stage_1_objective: "public_objective",
  public_stage_2_objective: "public_objective",
  event: "event",
};

const AUTOMATION_LABELS = { automated: "Automated", integrated: "Integrated", other: "Manual" };

/* ── Init ────────────────────────────────────────────────── */
function init() {
  const totalDecks = Object.keys(DECKS_DATA).length;
  document.getElementById("data-banner").textContent = totalDecks
    ? `${totalDecks} decks loaded`
    : "No deck data yet — waiting for first sync run (.github/workflows/sync-asyncti4.yml)";
  loadFromLocalStorage();
  loadBuilderDraft();
  loadCardMakerDraft();
  renderRail();
  renderPicker();
  renderCardBrowser();
  clearDetail();
  updateOutput();
  setMobileView("left");
  setBuilderView("left");
  setCardMakerView("left");
}

init();
