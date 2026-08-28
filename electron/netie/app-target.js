"use strict";
/**
 * Target-application recognition (#24, EPIC-P06).
 *
 * The command bar's acceptance requires two things that did not exist: recognize
 * the application named in a typed intent, and confirm it by name before acting
 * ("Do you want to type in Notepad?"). What existed instead was three app names
 * baked into recipe regexes (`recipes.js`) - phrase matching for fixed SOPs, so
 * "put this in Notes" or "open it in Excel" matched nothing at all.
 *
 * Two properties matter more than coverage:
 *
 *   1. A name Pointer cannot drive must be SAID, not silently ignored. "Put this
 *      in Photoshop" previously fell through to a generic plan that did
 *      something else entirely; that is a silent fallback, and a silent fallback
 *      is a lie (KB R-0011).
 *
 *   2. Recognition is a hint, never authority. It names what the customer asked
 *      for so the confirmation can be specific. It does not widen what the
 *      driver may launch - `plan-guard` still forces a human beat on every
 *      launch, and `safety.decide()` still tiers the action. Screen and model
 *      text stay data, not commands (CLAUDE.md Hard rule 2).
 *
 * Pure and deterministic, so the confirmation wording can be asserted without
 * booting Electron.
 */

/**
 * Applications Pointer can actually drive, with the launch target the `open`
 * verb understands. `drivable: false` entries exist so the system can name the
 * app it recognized and then say plainly that it cannot drive it - which is the
 * whole point of the second half of the acceptance.
 */
const APP_CATALOG = Object.freeze([
  { id: "word", name: "Word", launch: "winword", aliases: ["word", "microsoft word", "ms word", "winword", "docx"] },
  { id: "excel", name: "Excel", launch: "excel", aliases: ["excel", "microsoft excel", "ms excel", "spreadsheet", "xlsx"] },
  { id: "powerpoint", name: "PowerPoint", launch: "powerpnt", aliases: ["powerpoint", "power point", "ppt", "slides", "slide deck", "deck", "pptx"] },
  { id: "outlook", name: "Outlook", launch: "outlook", aliases: ["outlook", "my email", "mail app"] },
  { id: "notepad", name: "Notepad", launch: "notepad", aliases: ["notepad", "notes", "note pad", "text editor"] },
  { id: "explorer", name: "File Explorer", launch: "explorer", aliases: ["explorer", "file explorer", "windows explorer", "my files", "file manager"] },
  { id: "chrome", name: "Chrome", launch: "chrome", aliases: ["chrome", "google chrome"] },
  { id: "edge", name: "Edge", launch: "msedge", aliases: ["edge", "microsoft edge"] },
  { id: "firefox", name: "Firefox", launch: "firefox", aliases: ["firefox", "mozilla"] },
  { id: "cursor", name: "Cursor", launch: "cursor", aliases: ["cursor", "cursor ide"] },
  { id: "claude", name: "Claude Code", launch: "claude", aliases: ["claude", "claude code", "claude.ai"] },
  { id: "vscode", name: "VS Code", launch: "code", aliases: ["vs code", "vscode", "visual studio code"] },
  { id: "terminal", name: "Terminal", launch: "wt", aliases: ["terminal", "powershell", "command prompt", "cmd", "console", "shell"] },
  { id: "calculator", name: "Calculator", launch: "calc", aliases: ["calculator", "calc"] },
  { id: "paint", name: "Paint", launch: "mspaint", aliases: ["paint", "ms paint", "mspaint"] },

  // Recognized but not driven. Naming them is the feature: the customer hears
  // "I can't drive Photoshop" instead of watching Pointer do something else.
  { id: "photoshop", name: "Photoshop", drivable: false, aliases: ["photoshop", "ps"] },
  { id: "slack", name: "Slack", drivable: false, aliases: ["slack"] },
  { id: "teams", name: "Teams", drivable: false, aliases: ["teams", "microsoft teams", "ms teams"] },
  { id: "zoom", name: "Zoom", drivable: false, aliases: ["zoom"] },
  { id: "figma", name: "Figma", drivable: false, aliases: ["figma"] },
  { id: "spotify", name: "Spotify", drivable: false, aliases: ["spotify"] },
]);

/**
 * Prepositions that mean "this next word is the destination". Requiring one
 * keeps "the word document" or "my slack message about excel" from being read
 * as a launch order - a bare app name in the middle of a sentence is usually a
 * topic, not a target.
 */
const DESTINATION_LEAD = "(?:in|into|on|to|using|with|via|open|launch|start|switch to|inside)";

/** Verbs the command bar can phrase a confirmation around. */
const VERB_PHRASES = Object.freeze({
  type: "type in",
  write: "write in",
  paste: "paste into",
  copy: "copy into",
  open: "open",
  read: "read from",
  click: "click in",
  default: "work in",
});

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Recognize the target application named in an intent.
 *
 * Longest alias first, so "microsoft word" is not matched as "word" and
 * "power point" is not matched as "point".
 *
 * @param {string} text
 * @returns {{id:string, name:string, drivable:boolean, launch:string|null,
 *            alias:string, explicit:boolean}|null}
 */
function recognizeApp(text) {
  const hay = normalize(text);
  if (!hay) return null;

  const candidates = [];
  for (const app of APP_CATALOG) {
    for (const alias of app.aliases) {
      candidates.push({ app, alias });
    }
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length);

  let fallback = null;
  for (const { app, alias } of candidates) {
    const a = escapeRe(alias);
    // `\b` on both sides so "wordy" and "excellent" do not match.
    const explicit = new RegExp(`\\b${DESTINATION_LEAD}\\s+(?:the\\s+|my\\s+|a\\s+)?(?:microsoft\\s+|ms\\s+)?${a}\\b`);
    if (explicit.test(hay)) {
      return {
        id: app.id,
        name: app.name,
        drivable: app.drivable !== false,
        launch: app.launch || null,
        alias,
        explicit: true,
      };
    }
    if (!fallback && new RegExp(`\\b${a}\\b`).test(hay)) {
      fallback = {
        id: app.id,
        name: app.name,
        drivable: app.drivable !== false,
        launch: app.launch || null,
        alias,
        explicit: false,
      };
    }
  }
  return fallback;
}

/** The verb the customer asked for, used only to phrase the confirmation. */
function recognizeVerb(text) {
  const hay = normalize(text);
  if (/\b(paste|drop)\b/.test(hay)) return "paste";
  if (/\b(copy|duplicate)\b/.test(hay)) return "copy";
  if (/\b(type|enter|input)\b/.test(hay)) return "type";
  if (/\b(write|draft|compose|summari[sz]e into)\b/.test(hay)) return "write";
  if (/\b(open|launch|start|switch)\b/.test(hay)) return "open";
  if (/\b(read|extract|pull)\b/.test(hay)) return "read";
  if (/\b(click|press|tap)\b/.test(hay)) return "click";
  return "default";
}

/**
 * The confirmation the command bar shows before acting.
 *
 * @param {string} text  the customer's typed or spoken intent
 * @returns {{recognized:boolean, app:object|null, verb:string,
 *            drivable:boolean, question:string|null, refusal:string|null}}
 */
function describeTarget(text) {
  const app = recognizeApp(text);
  const verb = recognizeVerb(text);
  if (!app) {
    return { recognized: false, app: null, verb, drivable: false, question: null, refusal: null };
  }
  if (!app.drivable) {
    return {
      recognized: true,
      app,
      verb,
      drivable: false,
      question: null,
      // Named, and named as a limit. Not a generic "something went wrong", and
      // not a silent substitution of some other app (KB R-0011).
      refusal: `I recognized ${app.name}, but Pointer cannot drive ${app.name} yet. I can put the text on your clipboard instead.`,
    };
  }
  const phrase = VERB_PHRASES[verb] || VERB_PHRASES.default;
  return {
    recognized: true,
    app,
    verb,
    drivable: true,
    question: `Do you want to ${phrase} ${app.name}?`,
    refusal: null,
  };
}

module.exports = {
  APP_CATALOG,
  recognizeApp,
  recognizeVerb,
  describeTarget,
};
