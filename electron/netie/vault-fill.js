"use strict";
/**
 * WP-P1-VAULT-FILL — resolve `{{vault.*}}` placeholders just before execution.
 *
 * Two rules shape everything here:
 *
 * 1. A plan never carries the user's personal data. Skills and the planner emit
 *    `{{vault.profile.email}}`; the real value is substituted at the last
 *    moment, in this file. So the plan that goes to the model, to the audit
 *    ledger and to the approval UI shows the placeholder, not the address.
 *
 * 2. An unresolved placeholder is never typed. Typing `{{vault.profile.email}}`
 *    into a live form is not a cosmetic bug — it lands in a field the user then
 *    submits. Unresolved values are blanked and forced to a human beat, and
 *    secrets are refused outright: passwords and OTPs are custody's job
 *    (see ./safety.js SECRET_TARGET_WORDS and ecosystem.requestCustody).
 *
 * Pure and network-free — unit-testable without a vault.
 */

/** The fields a form-fill skill is allowed to know about. */
const PROFILE_FIELDS = Object.freeze([
  { key: "name", label: "Full name", aliases: ["full name", "your name", "name"] },
  { key: "first_name", label: "First name", aliases: ["first name", "given name", "forename"] },
  { key: "last_name", label: "Last name", aliases: ["last name", "surname", "family name"] },
  { key: "email", label: "Email", aliases: ["email", "e-mail", "email address"] },
  { key: "phone", label: "Phone", aliases: ["phone", "mobile", "telephone", "contact number"] },
  { key: "company", label: "Company", aliases: ["company", "organisation", "organization", "employer"] },
  { key: "job_title", label: "Job title", aliases: ["job title", "role", "position"] },
  { key: "address1", label: "Address", aliases: ["address", "street", "address line 1"] },
  { key: "address2", label: "Address 2", aliases: ["address line 2", "apartment", "unit"] },
  { key: "city", label: "City", aliases: ["city", "town", "suburb"] },
  { key: "state", label: "State", aliases: ["state", "province", "region"] },
  { key: "postcode", label: "Postcode", aliases: ["postcode", "zip", "zip code", "postal code"] },
  { key: "country", label: "Country", aliases: ["country"] },
  { key: "website", label: "Website", aliases: ["website", "url", "homepage"] },
  // Travel / booking — non-secret. Passport *number* stays in SECRET_KEYS.
  { key: "passport_name", label: "Passport name", aliases: ["passport name", "name as on passport", "travel name"] },
  { key: "dob", label: "Date of birth", aliases: ["date of birth", "dob", "birth date", "birthday"] },
  { key: "nationality", label: "Nationality", aliases: ["nationality", "citizenship"] },
  { key: "frequent_flyer", label: "Frequent flyer", aliases: ["frequent flyer", "ff number", "loyalty number"] },
  { key: "seat_pref", label: "Seat preference", aliases: ["seat preference", "seat pref", "aisle", "window"] },
  { key: "meal_pref", label: "Meal preference", aliases: ["meal preference", "meal pref", "special meal"] },
]);

/**
 * Never resolvable from the profile, whatever the vault happens to hold.
 * These route to OpenVault custody, which types them itself under the user's
 * own approval — the agent must not be able to read them at all.
 *
 * Use `passport_number` (not bare `passport`) so `passport_name` stays fillable.
 */
const SECRET_KEYS = Object.freeze([
  "password", "passcode", "pin", "otp", "one_time_code", "2fa", "mfa",
  "cvv", "cvc", "card", "card_number", "credit_card", "security_code",
  "ssn", "social_security", "passport_number", "passport_no", "passport_id",
  "iban", "routing_number",
  "account_number", "api_key", "secret", "secret_key", "token",
  "private_key", "seed_phrase", "recovery_phrase",
]);

const TEMPLATE_RE = /\{\{\s*vault\.([a-zA-Z0-9_.\-]+)\s*\}\}/g;
/** Fields whose contents get typed and therefore need resolving. */
const VALUE_FIELDS = Object.freeze(["value", "text"]);

function isSecretPath(path) {
  const tail = String(path || "").split(".").pop().toLowerCase();
  const whole = String(path || "").toLowerCase();
  // Exact tail match first. `includes` only for multi-word secrets that are
  // not also prefixes of allowed profile keys (passport_name vs passport_number).
  if (SECRET_KEYS.some((s) => tail === s || whole.endsWith(`.${s}`))) return true;
  if (tail === "passport_name" || whole.endsWith(".passport_name")) return false;
  return SECRET_KEYS.some((s) => s.length >= 4 && tail.includes(s));
}

/**
 * After resolveVaultTemplates, which profile keys still need the human?
 * Used by the enquire UI — never type placeholders.
 */
function missingVaultKeys(actions) {
  const keys = [];
  const seen = new Set();
  const list = Array.isArray(actions) ? actions : [];
  for (const action of list) {
    if (!action || typeof action !== "object") continue;
    for (const field of VALUE_FIELDS) {
      const raw = action[field];
      if (typeof raw !== "string" || !raw.includes("{{")) continue;
      TEMPLATE_RE.lastIndex = 0;
      let m;
      while ((m = TEMPLATE_RE.exec(raw))) {
        const path = m[1];
        if (isSecretPath(path)) continue;
        const bare = path.startsWith("profile.") ? path.slice("profile.".length) : path;
        if (!seen.has(bare)) {
          seen.add(bare);
          keys.push(bare);
        }
      }
    }
  }
  return keys;
}

/**
 * Look a dotted path up in a profile that may be flat (`{"profile.email": …}`),
 * nested (`{profile: {email: …}}`), or bare (`{email: …}`). Real vault exports
 * are all three shapes depending on who wrote them, and guessing wrong here
 * reads to the user as "the vault is empty".
 */
function lookupProfile(profile, path) {
  if (!profile || typeof profile !== "object") return undefined;
  const clean = String(path || "").trim();
  if (!clean) return undefined;

  const candidates = [clean];
  if (clean.startsWith("profile.")) candidates.push(clean.slice("profile.".length));
  else candidates.push(`profile.${clean}`);

  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(profile, key)) {
      const v = profile[key];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
  }
  for (const key of candidates) {
    let node = profile;
    let ok = true;
    for (const part of key.split(".")) {
      if (node && typeof node === "object" && Object.prototype.hasOwnProperty.call(node, part)) {
        node = node[part];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && node !== undefined && node !== null && node !== "" && typeof node !== "object") {
      return String(node);
    }
  }
  return undefined;
}

/**
 * Substitute `{{vault.*}}` in every typed value.
 *
 * All-or-nothing per value: a value with two placeholders where only one
 * resolves would type "Ada " into a name field and look like it worked, so a
 * single miss blanks the whole value and demands a human.
 *
 * @param {object[]} actions
 * @param {object} profile   flat, nested, or bare profile map
 * @returns {object[]} new actions — inputs are never mutated
 */
function resolveVaultTemplates(actions, profile, opts = {}) {
  const list = Array.isArray(actions) ? actions : [];
  const onCustody = typeof opts.onCustody === "function" ? opts.onCustody : null;

  return list.map((action) => {
    if (!action || typeof action !== "object") return action;
    const next = { ...action };

    for (const field of VALUE_FIELDS) {
      const raw = next[field];
      if (typeof raw !== "string" || !raw.includes("{{")) continue;

      const misses = [];
      const secrets = [];
      const resolved = raw.replace(TEMPLATE_RE, (token, path) => {
        if (isSecretPath(path)) {
          secrets.push(path);
          return "";
        }
        const value = lookupProfile(profile, path);
        if (value === undefined) {
          misses.push(token);
          return "";
        }
        return value;
      });

      if (secrets.length) {
        // Custody territory. Blank it, flag it, and let the caller hand it to
        // OpenVault — the agent never sees or types a secret.
        next[field] = "";
        next._custody = secrets[0];
        next._requireConfirm = true;
        next.safety = { ...(next.safety || {}), disposition: "custody", reason: "vault-secret" };
        if (onCustody) onCustody({ action: next, path: secrets[0] });
        continue;
      }
      if (misses.length) {
        // `_requireConfirm` is the same flag plan-guard sets for launches, so
        // safety.decide() already downgrades this to "approve" — one mechanism,
        // not a second policy that can drift out of step.
        next[field] = "";
        next._unresolved = misses[0];
        next._requireConfirm = true;
        next.safety = { ...(next.safety || {}), disposition: "approve", reason: "unresolved-vault-template" };
        continue;
      }
      next[field] = resolved;
      next._vaultFilled = true;
    }
    return next;
  });
}

/**
 * True if any action still carries a raw placeholder — the thing we must never
 * type. Uses its own non-global regex: `TEMPLATE_RE.test()` would carry
 * `lastIndex` between calls and start returning false on identical input.
 */
const TEMPLATE_PROBE = /\{\{\s*vault\.[a-zA-Z0-9_.\-]+\s*\}\}/;
function hasRawTemplate(actions) {
  return (Array.isArray(actions) ? actions : []).some((a) =>
    a && typeof a === "object" && VALUE_FIELDS.some((f) => typeof a[f] === "string" && TEMPLATE_PROBE.test(a[f]))
  );
}

/**
 * Match a field label seen on screen ("E-mail address") to a profile key.
 *
 * Earliest match wins, then longest. Longest-alone gets "E-mail address" wrong
 * — "address" (7) beats "e-mail" (6) and the agent types a street into an email
 * box. The head of a label is what names it: "Email address" is an email,
 * "Street address" is a street, "Company name" is a company.
 */
function matchProfileField(text) {
  const hay = String(text || "").toLowerCase();
  if (!hay.trim()) return null;
  let best = null;
  for (const field of PROFILE_FIELDS) {
    for (const alias of field.aliases) {
      const at = hay.indexOf(alias);
      if (at < 0) continue;
      if (!best || at < best.at || (at === best.at && alias.length > best.length)) {
        best = { key: field.key, at, length: alias.length };
      }
    }
  }
  return best ? best.key : null;
}

/** The placeholder a skill should emit for a profile key — never the value. */
function vaultToken(key) {
  return `{{vault.profile.${key}}}`;
}

function profileSchema() {
  return PROFILE_FIELDS.map((f) => ({ key: f.key, label: f.label, token: vaultToken(f.key) }));
}

module.exports = {
  PROFILE_FIELDS,
  SECRET_KEYS,
  TEMPLATE_RE,
  resolveVaultTemplates,
  hasRawTemplate,
  lookupProfile,
  matchProfileField,
  isSecretPath,
  missingVaultKeys,
  vaultToken,
  profileSchema,
};
