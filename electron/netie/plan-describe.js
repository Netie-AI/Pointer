"use strict";
/**
 * Plan disclosure — turn a reviewed plan into something a human can actually
 * consent to (#20).
 *
 * The approval prompt used to say `5 step(s) - nod or approve`. A count is not
 * disclosure: a customer approving "5 steps" has no way to know that step 4
 * writes a .docx, still less where it writes it. Combined with a model-supplied
 * destination that made the approval nominally informed and actually blind.
 *
 * Everything needed to render this was already computed and then thrown away -
 * `safety.decide()` returns `{tier, disposition, irreversible, secret}` per
 * action, and `plan-guard` annotates launches with `_confirmReason`. This module
 * is the missing render step, not new policy.
 *
 * Two rules it must never break:
 *   1. Never echo a secret value. The verb and the field name are disclosure;
 *      the value is the thing custody exists to keep out of logs and toasts.
 *   2. Never claim a destination the action does not carry. "Writes a document"
 *      is honest when no path was given; inventing the default path here would
 *      be a different kind of lie (KB R-0011).
 *
 * Pure functions, no I/O - same stance as safety.js, so the disclosure can be
 * asserted without booting Electron.
 */

const MAX_TEXT = 60;

function clip(value, max = MAX_TEXT) {
  const s = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}...` : s;
}

/** What the action points at, in the order most likely to be human-readable. */
function targetOf(action) {
  return clip(
    action.targetText || action.label || action.target || action.selectorText || action.field || ""
  );
}

/** Where a write lands. Only ever the path the action actually carries. */
function destinationOf(action) {
  return clip(action.path || action.target || "", 120);
}

/**
 * One plain-language line for one action.
 * @returns {{verb:string, text:string, destination:string, danger:boolean, secret:boolean}}
 */
function describeAction(action) {
  const a = action && typeof action === "object" ? action : {};
  const type = String(a.type || "").toLowerCase();
  const safety = a.safety || {};
  const secret = Boolean(safety.secret || a._custody);
  const danger = Boolean(safety.irreversible);
  const target = targetOf(a);
  const where = target ? ` "${target}"` : "";

  let verb;
  let text;
  let destination = "";

  switch (type) {
    case "word_docx_append": {
      verb = "Append";
      destination = destinationOf(a);
      text = destination
        ? `Append to the Word document at ${destination}`
        : "Append to a Word document in the Pointer documents folder";
      break;
    }

    case "word_docx_write":
    case "word_from_clipboard": {
      verb = "Write";
      destination = destinationOf(a);
      const source = type === "word_from_clipboard" ? " from the clipboard" : "";
      text = destination
        ? `Write a Word document${source} to ${destination}`
        : `Write a Word document${source} to the Pointer documents folder`;
      break;
    }

    case "open":
    case "navigate":
      verb = "Launch";
      // plan-guard already phrased this at the moment it forced the human beat.
      text = a._confirmReason || `Launch ${clip(a.url || a.target || "an application")}`;
      destination = clip(a.url || a.target || "", 120);
      break;

    case "type":
    case "fill":
    case "setvalue":
      verb = "Type";
      // The field is disclosure; the value is custody's business.
      text = secret
        ? `Type a stored secret into${where || " a field"} (value never shown)`
        : `Type ${a.value ? `"${clip(a.value, 40)}"` : "text"} into${where || " a field"}`;
      break;

    case "paste":
    case "clipboard_paste":
      verb = "Paste";
      text = `Paste the clipboard into${where || " the focused field"}`;
      break;

    case "click":
      verb = "Click";
      text = `Click${where || " the targeted control"}`;
      break;
    case "uia_invoke":
      verb = "Invoke";
      text = `Invoke${where || " the named control"} without moving the cursor`;
      break;
    case "uia_toggle": {
      verb = "Toggle";
      const want = String(a.want || "flip").toLowerCase();
      if (want === "on") text = `Check${where || " the named box"}`;
      else if (want === "off") text = `Uncheck${where || " the named box"}`;
      else text = `Toggle${where || " the named box"}`;
      break;
    }
    case "uia_expand": {
      verb = String(a.want || "expand").toLowerCase() === "collapse" ? "Collapse" : "Expand";
      text =
        verb === "Collapse"
          ? `Collapse${where || " the named control"}`
          : `Expand${where || " the named control"}`;
      break;
    }
    case "doubleclick":
      verb = "Double-click";
      text = `Double-click${where || " the targeted control"}`;
      break;
    case "rightclick":
      verb = "Right-click";
      text = `Right-click${where || " the targeted control"}`;
      break;

    case "press":
    case "keypress":
      verb = "Press";
      text = `Press ${clip(a.keys || a.value || a.target || "a key", 30)}`;
      break;

    case "focus_hwnd":
      verb = "Focus";
      text = "Focus the remembered app window";
      break;

    case "copy":
    case "select_copy":
    case "copy_clipboard":
      verb = "Copy";
      text = `Copy${where || " the selection"} to the clipboard`;
      break;

    case "select_all":
      verb = "Select";
      text = "Select everything in the focused window";
      break;

    case "clipboard_set":
      verb = "Set clipboard";
      text = secret ? "Put a stored secret on the clipboard" : "Put text on the clipboard";
      break;

    case "scroll":
      verb = "Scroll";
      text = `Scroll${where ? ` to${where}` : ""}`;
      break;

    case "drag":
      verb = "Drag";
      text = `Drag${where || " the targeted item"}`;
      break;

    case "observe":
    case "read":
    case "screenshot":
      verb = "Look";
      text = "Look at the screen";
      break;

    case "wait":
      verb = "Wait";
      text = `Wait ${clip(a.ms || a.value || "a moment", 20)}`;
      break;

    case "clipboard_verify":
      verb = "Check";
      text = "Check the clipboard matches what was copied";
      break;

    default:
      // An unnamed verb is exactly the case where a count would have hidden the
      // most. Say plainly that we do not know what it does.
      verb = type || "unknown";
      text = `Run an unrecognized step "${clip(type || "(no type)", 40)}"${where}`;
      break;
  }

  return { verb, text, destination, danger, secret, type };
}

/**
 * Describe a whole plan for the approval moment.
 *
 * @param {object[]} actions  reviewed actions (safety annotations optional)
 * @param {{max?:number}} [opts]
 * @returns {{lines:string[], steps:object[], summary:string, destinations:string[],
 *           hasIrreversible:boolean, hasSecret:boolean}}
 */
function describePlan(actions, opts = {}) {
  const list = Array.isArray(actions) ? actions : [];
  const max = opts.max || 8;
  const steps = list.map(describeAction);

  const lines = steps.slice(0, max).map((s, i) => {
    const flag = s.danger ? " [irreversible]" : "";
    return `${i + 1}. ${s.text}${flag}`;
  });
  if (steps.length > max) lines.push(`...and ${steps.length - max} more`);

  const destinations = [...new Set(steps.map((s) => s.destination).filter(Boolean))];
  const hasIrreversible = steps.some((s) => s.danger);
  const hasSecret = steps.some((s) => s.secret);

  // The one-line version, for the subtitle and the answer meta. Leads with the
  // verbs rather than the count, because the verbs are the decision.
  let summary;
  if (!steps.length) {
    summary = "Nothing to do";
  } else if (steps.length === 1) {
    summary = steps[0].text;
  } else {
    const verbs = [...new Set(steps.map((s) => s.verb.toLowerCase()))];
    summary = `${steps.length} steps: ${verbs.slice(0, 4).join(", ")}`;
    if (verbs.length > 4) summary += ", ...";
  }
  if (hasIrreversible) summary += " - includes an irreversible step";

  return { lines, steps, summary, destinations, hasIrreversible, hasSecret };
}

/**
 * The full approval prompt: what will happen, where it lands, and how to say
 * yes. Replaces `${n} step(s) - nod or approve`.
 */
function approvalPrompt(actions, opts = {}) {
  const d = describePlan(actions, opts);
  const parts = [d.summary];
  if (d.destinations.length) parts.push(`Destination: ${d.destinations.join(", ")}`);
  parts.push("Nod or approve to run.");
  return { ...d, prompt: parts.join(" - "), detail: d.lines.join("\n") };
}

module.exports = { describeAction, describePlan, approvalPrompt };
