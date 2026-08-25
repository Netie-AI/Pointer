"use strict";
/**
 * P5-ENQUIRE — ask the human for the profile fields the vault does not have.
 *
 * `prepareVaultPlan` refuses to type an unresolved `{{vault.profile.city}}`, which
 * is correct and also a dead end: the plan stops and the user is told what is
 * missing but given no way to supply it. This is the way to supply it.
 *
 * The dangerous shape here is obvious once stated: an "enquire" box is a form
 * that writes straight into the store the agent fills from. Two rules keep it
 * from becoming a credential prompt or an injection vector:
 *
 * 1. **Secrets are refused, loudly.** A password typed here would then be typed
 *    by the agent, which is precisely the route custody exists to prevent.
 *    Asking for one is a bug in the caller, so it is rejected with a reason
 *    rather than quietly dropped.
 * 2. **Values are sanitised for a keyboard, not for a database.** Whatever is
 *    entered here is later sent to the OS as keystrokes. A newline submits the
 *    form; a tab jumps to the next field and puts the rest of the answer in it.
 *    Control characters are stripped, not escaped.
 *
 * Pure — no IPC, no store, no DOM.
 */

const { PROFILE_FIELDS, SECRET_KEYS, isSecretPath } = require("./vault-fill");

/** A profile value is a line on a form, never a document. */
const MAX_VALUE_LEN = 200;
/** Enough to fill a form, few enough that the panel is not a questionnaire. */
const MAX_FIELDS = 6;

/**
 * Anything that behaves as a key rather than a character. Written as explicit
 * escapes on purpose — a literal control-character class is invisible in source
 * and does not survive a copy/paste or a lint autofix intact.
 */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

const FIELD_BY_KEY = new Map(PROFILE_FIELDS.map((f) => [f.key, f]));

/** Examples make a field unambiguous faster than a label does. */
const HINTS = Object.freeze({
  name: "Ada Lovelace",
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  phone: "+60 12-345 6789",
  passport_name: "exactly as printed on the passport",
  dob: "1990-05-17",
  nationality: "Malaysian",
  frequent_flyer: "MH 1234 5678",
  seat_pref: "aisle / window",
  meal_pref: "vegetarian",
  postcode: "50450",
});

/**
 * Turn the missing-key list into something a panel can render.
 * Unknown and secret keys never become inputs.
 *
 * @param {string[]} keys  from vault-fill.missingVaultKeys()
 * @returns {Array<{key:string,label:string,hint:string}>}
 */
function fieldsToPrompts(keys) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(keys) ? keys : []) {
    const key = String(raw || "").trim();
    if (!key || seen.has(key)) continue;
    if (isSecretPath(key)) continue; // never render a secret as an input
    const field = FIELD_BY_KEY.get(key);
    if (!field) continue; // not a profile field we know how to fill
    seen.add(key);
    out.push({ key, label: field.label, hint: HINTS[key] || "" });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}

/**
 * Strip everything that would behave as a key rather than a character.
 * Newline submits, tab moves focus, escape closes the dialog — all of which
 * happen to a form the agent is halfway through filling.
 */
function sanitizeValue(raw) {
  if (raw == null) return "";
  return String(raw)
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_VALUE_LEN);
}

/**
 * Validate what the human typed into the panel.
 *
 * @param {object} answers  { [profileKey]: value }
 * @returns {{profile:object, accepted:string[], rejected:Array<{key:string,reason:string}>}}
 */
function validateAnswers(answers) {
  const profile = {};
  const accepted = [];
  const rejected = [];

  const entries = answers && typeof answers === "object" ? Object.entries(answers) : [];
  for (const [rawKey, rawValue] of entries) {
    const key = String(rawKey || "").trim();
    if (!key) continue;

    if (isSecretPath(key) || SECRET_KEYS.includes(key.toLowerCase())) {
      // Loud, not silent: a caller that got here is asking the agent to learn a
      // secret, and that has to be visible rather than look like a typo.
      rejected.push({ key, reason: "secret — use OpenVault custody, never the profile" });
      continue;
    }
    if (!FIELD_BY_KEY.has(key)) {
      rejected.push({ key, reason: "not a profile field" });
      continue;
    }
    const value = sanitizeValue(rawValue);
    if (!value) continue; // blank means "skip", not "store empty"
    profile[key] = value;
    accepted.push(key);
  }

  return { profile, accepted, rejected };
}

/** One line for the HUD once the answers land. */
function describeResult({ accepted = [], rejected = [] } = {}) {
  const bits = [];
  if (accepted.length) bits.push(`Saved ${accepted.join(", ")}`);
  if (rejected.length) bits.push(`refused ${rejected.map((r) => r.key).join(", ")}`);
  return bits.join(" · ") || "Nothing to save";
}

module.exports = {
  MAX_VALUE_LEN,
  MAX_FIELDS,
  HINTS,
  CONTROL_CHARS,
  fieldsToPrompts,
  sanitizeValue,
  validateAnswers,
  describeResult,
};
