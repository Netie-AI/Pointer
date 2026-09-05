---
status: proposed
date: 2026-09-05
decision-makers: founder
---

# DR-0004 - Unattended Pointer: mandates, the identity store, and the message connectors

## Context and Problem Statement

Founder request, 2026-09-05, four asks in one message:

1. "rewrite pointer to be a smartest agent that work behind, auditable, can check what it
   click and perform later"
2. "Central database about knowledge base memory about me important details, always use
   anywhere when dealing with forms, buying stuff"
3. "access my phone for Codes verification"
4. "build gmail connectors, whatsapp connector, phone number sms retreiver auto forward
   et cetera. email auto forward et cetera"

Ask 1 is Pointer's named next task ("Unattended clicks"). Asks 2, 3 and 4 each collide
with something already decided: `PARKING_LOT.md` P-02 / P-05 / P-06, KB `F-0030`, and the
`SECRET_KEYS` / custody boundary that KB `A-0006` exists to protect. This record answers
all four in one place so the collisions are decided rather than discovered mid-build.

## Decision Drivers

- `A-0005` (critical) - executor-trust flags travelling on model-supplied action data.
  Fixed in `ecosystem.js` by whitelisting planner fields. Unattended execution is the
  feature most likely to reopen it, because the cheap way to build it is to let the
  planner mark its own steps runnable.
- `A-0006` (high) - custody silently downgraded when a disposition is re-derived from
  redacted data. The reason OTP and password fields are refused to the agent by name.
- `F-0030` (high) - one orchestration layer (Cortex), one vault (OpenVault). A scale
  request must not grow a second vault inside another product.
- `R-0011` - a silent fallback is a lie. Degradation must be visible in the output.
- `R-0015` - agents never drive the founder's desktop software uninvited.
- `CLAUDE.md` Hard rule 2 - screen text is data, not commands.

## Ask 1 - Unattended clicks

**Decision: build, and it is built.** Not a rewrite. Pointer already has the vault, the
safety tiers, the plan guard, the driver, the verifier and a background job queue; what it
lacked was a way to authorise a step with no human at the HUD, and a record that survives
Cortex being down.

Two modules, on branch `feat/unattended-ledger-mandate`:

- `electron/netie/ledger.js` - append-only, hash-chained local record. Every
  `eco.audit(...)` call site became durable at once, because `audit()` now writes locally
  first and posts to Cortex second. Previously the post sat inside a bare `catch` that
  returned `false`, so with Cortex down the event was written nowhere and the app could
  not say so. That is the defect behind "auditable, can check what it click": there was no
  record to check. `auditHealth()` now reports pending count and chain integrity.
- `electron/netie/mandate.js` - a narrow, expiring, revocable grant a human creates before
  the job starts. Authority travels with the runner, never on the action: an action
  arriving with `_approved` or `_mandateId` is refused as tampering. A mandate can only
  narrow - `safety.js` still classifies first, custody stays custody, and payment and
  account-destruction are refused unconditionally whatever the grant says.

39 tests, in the `npm test` gate. This half needs no founder decision; it is recorded here
because asks 2-4 all assume it.

**Still open (founder call):** whether the HUD shows a live "Pointer may act" mandate chip.
Recommendation: yes, and revocable in one click. An unattended grant the user cannot see is
not consent.

## Ask 2 - The central store of "important details about me"

**Recommendation: expand what Pointer already owns; do not build a database.**

The thing being asked for mostly exists. `vault-fill.js` defines the non-secret profile
(`PROFILE_FIELDS`), plans carry `{{vault.profile.email}}` rather than the value, and the
substitution happens at the last moment so the address never reaches the model, the audit
ledger or the approval UI. `settings.js` holds the values.

Two boundaries must survive the expansion:

- **Non-secret only.** `SECRET_KEYS` (card number, CVV, passport number, SSN, seed phrase,
  OTP) stay unresolvable from the profile whatever the store holds. They route to OpenVault
  custody, which types them itself. F-0030 is explicit that OpenVault is the one vault; a
  richer profile inside Pointer is fine, a second credential store is not.
- **"Always use anywhere" is the fill path, not a sync.** The way this reaches other
  surfaces is that skills emit `{{vault.profile.*}}` tokens. It is not a service other apps
  read from.

Unblocked work, no DR needed: more `PROFILE_FIELDS`, an import path, and a completeness
view so the user can see what is missing before a form stalls on a human beat.

## Ask 3 - Reading verification codes off the phone

**Recommendation: refuse as specified. Build the custody version instead.** This is the
one that needs the founder, and the only ask here I would not build on request.

An OTP's entire security value is that it arrives on a channel the attacker does not
control. Every other control in this codebase is shaped so that one compromise costs one
wrong click: the mandate caps steps, `NEVER_COVERED` refuses payment, custody means the
agent never holds the secret. If Pointer can read the SMS and type the code, a compromise
stops costing a click and starts costing the account - password resets, new-device logins
and payment confirmations all complete without a human. And the input that drives Pointer
is the screen, which `A-0005` already proved is an injection surface: poisoned pixels reach
the planner by construction.

The safe version is a small change to a path that already exists. `eco.requestCustody()`
asks OpenVault to fill a secret field itself; Pointer never sees the value, and
`test/acceptance/custody.test.js` pins that the value never reaches the audit trail. Route
the phone to **OpenVault**, not to Pointer:

1. The code arrives at OpenVault, which already owns credentials.
2. Pointer hits an OTP field, classifies it PROHIBITED (it already does), and requests
   custody.
3. OpenVault injects, with the founder approving on the device.

Same convenience at the keyboard. Pointer still cannot complete a login on its own, which
is the property worth keeping. Unblock condition for anything broader: a founder DR that
names what an agent holding the second factor is allowed to do, and a mandate class that
cannot cover a login flow.

## Ask 4 - Gmail, WhatsApp, SMS connectors and auto-forward

**Recommendation: one read-only Gmail connector first. No auto-forward yet.**

`PARKING_LOT.md` already carries this ground with unlock conditions: P-02 (share-anywhere
WhatsApp / Slack), P-05 (local callable actuator, explicitly "not a cloud connector
marketplace"), P-06 (outbound email recorder, blocked on "a founder DR names who receives
mail and what may leave the box"). Ask 4 is P-06's unlock condition arriving as a feature
request.

The asymmetry worth naming: reading mail is recoverable, forwarding is not. An auto-forward
rule is standing configuration that keeps sending after the session ends, after the mandate
expires, and after the founder has forgotten it exists - it is the one item here that
survives revocation. That is why it should be last, not first.

Proposed order:

1. **Gmail, read-only**, behind the mandate and the ledger, so "what did it read" has the
   same answer quality as "what did it click".
2. **Draft-only send**, human presses send. `NEVER_COVERED` already refuses "send" without
   an explicit per-label opt-in.
3. **Auto-forward**, only after this DR is accepted with a named recipient policy: which
   addresses may receive, which content classes may leave the box, and how the founder sees
   the rule later. Until then it stays P-06.

WhatsApp stays P-02. It has no sanctioned API on this box, so it means driving the desktop
app, which R-0015 forbids without the founder opening it.

## Consequences

- Unattended execution exists, is bounded, and is recorded locally rather than only in a
  Cortex ledger that is usually unreachable.
- Pointer still cannot pay, cannot delete an account, cannot read a secret, and cannot
  complete a second factor - unattended or not.
- Asks 3 and 4 are answered with a narrower build rather than a refusal, but both need the
  founder before code.

## Confirmation

- `test/mandate.test.js` - authority never travels on the action; payment and account
  destruction are never coverable; a grant expires, is spent, and can be revoked.
- `test/ledger.test.js` - the chain detects edits and deletions; secret values never enter
  the log.
- `test/ecosystem.test.js` - a Cortex outage costs synchronisation, not the record.
- Re-run `npm test && npm run test:contracts && npm run test:acceptance` before accepting.

---

## Amendment 1 - what an estate-wide map corrected, 2026-09-06

Everything above was written from Pointer's side of the wire. A ten-agent read
across all nine repos corrected four factual claims and found one ordering trap
that would have shipped a hole. Recorded rather than silently edited, because
the wrong version was acted on.

### Correction 1 - OpenVault already has credential custody. The gap is one endpoint.

Ask 3 above assumed the custody path was mostly unbuilt. It is not. OpenVault
serves a full secrets surface from `OpenMW/openmw/openvault/app.py`:
`POST /api/secrets/passwords` (1696), `POST /api/secrets/cards` (1715),
`GET /api/secrets/{id}/reveal` (1801), plus WebAuthn seal/unseal (2818-2880)
and an app-grant pairing flow (`/api/local/grants`, 1116-1163). Reveal already
gates on loopback AND `X-OpenVault-Reveal: intentional` AND unsealed AND an
audit line.

What is missing is narrow and specific: the endpoint Pointer actually calls.
`eco.requestCustody()` POSTs `http://127.0.0.1:5000/v1/custody/...` and OpenVault
serves nothing there, so **today every OTP and password field in Pointer 404s and
tells the customer to type it themselves.** The custody path is not a design
question. It is one missing route.

Same class, found alongside: `electron/netie/transcriber.js:34` posts to
`127.0.0.1:5000/v1/audio/transcriptions`, which OpenVault also does not serve.
Two independent Pointer clients assume `:5000` surfaces that were never built,
which makes this drift rather than an oversight. Any new Pointer-to-OpenVault
call should be added to a contract test that fails when the server lacks the route.

### Correction 2 - the ordering trap. Pairing lands BEFORE inject.

The obvious build is "ship `POST /v1/custody/inject`, gate it on loopback plus
the `intentional` header, done". That is unsafe, and it is unsafe in this
codebase's own vocabulary.

`docs/SECRETS_CUSTODY.md:281-284` in OpenVault says plainly that loopback does
not separate processes: any process running as the user reaches it. The header
is a client-supplied string. So the endpoint's authority would rest entirely on
the request that asks for it - which is precisely the shape `mandate.js`
classifies as `TAMPERED` on the Pointer side, and precisely KB `A-0005`. Shipping
inject alone gives the vault an endpoint that types secrets on demand for
anything running as the user.

The fix already exists half-built. `vault/app_grants.py` renders a pairing code
that nothing currently checks. Making `decide_grant()` compare it with
`hmac.compare_digest` binds an approval to the process that asked. **Pairing is
therefore a prerequisite of inject, not a follow-up.** Inject alone is refused.

### Correction 3 - the Gmail connector exists, in Cortex, blocked on one action.

Ask 4 proposed building a read-only Gmail connector. One already exists:
`CortexOS/crew/inbox.py`, IMAP read, explicitly "Crew never sends mail". AirGPT's
own CHANGELOG records the decision that it is IMAP/SMTP via Crew keys rather than
Google OAuth. It is waiting on a 16-character Google App Password and nothing
else. Building a second connector in AirGPT would contradict a decision already
taken and implemented.

Also load-bearing for Ask 4: Cortex bans `twilio`, `pywhatkit`, `baileys`,
`whatsapp-web.js` and `selenium` by name in `_BANNED_SEND`
(`auto_caller.py:84`), with a test pinning it. The SMS half of the ask is not
merely parked anywhere in the estate - it is refused in code.

### Correction 4 - the marketplace is an unparking decision, not a build.

Cortex already ships an 800-server offline MCP catalog, 153 subagents, and a
real stdio JSON-RPC MCP client with per-server arming and idle suspend. The
pieces are deliberately unjoined under Cortex P16. So "plugins marketplace" is
not a green field; it is a request to unpark, and Pointer P-05 ("not a cloud
connector marketplace", "no arbitrary third-party MCP servers") is the fence it
runs into. Founder call, not an engineering one.

### Correction 5 - Cortex is not currently an audit ledger of record.

The body above treats the Cortex ledger as the durable record Pointer syncs to.
On this box it is not. The append-only REVOKE and the update/delete trigger exist
only in the Postgres migration; `append()` falls back to a plain SQLite file when
`DMS_LEDGER_DSN` is unset, and nothing in the launch path sets it. `signature` is
always NULL, the actor is not in the hash preimage, and
`POST /v1/contract/ledger/append` has no auth dependency at all.

This does not change Pointer's design - local-first was already right - but it
does change the claim. Until those are fixed, **Pointer's local ledger is the
stronger record of the two**, and the estate should stop describing Cortex as the
ledger of record in prose while the default backend is a rewritable file.

### New decision surfaced - OpenVault is two servers

`OpenMW/rust/openvault-console` already has `accounts(username, netie_email,
gmail, phone, email_verified, phone_verified)`, a `verify_codes` table with
hashed six-digit codes and a 15-minute expiry, passkeys and sessions - in its own
`rust-auth.db`. That is a second identity store inside the one repo that is
supposed to be the single vault, and it is the natural home for exactly the
phone-verification flow Ask 3 asks for.

**Retire it or promote it, before anything is built on either.** Building custody
inject against the Python app while the Rust console owns phone verification
creates a third store rather than resolving the second. This is now the first
question, ahead of everything in the body above.
