# Netie Clicks — Dual Brain & Personal Assistant Governance

**Owner stance:** Netie operates the ecosystem. Cortex is the governed dual brain.
Netie Clicks is the eyes/hands. Users enjoy a dead-simple product; **we** hold capability,
keys, learning loops, and control planes. Third parties and attackers get nothing.

This document replaces the earlier refusal-heavy draft. It is the contract for maximum
product power with mythos-grade crypto against everyone who is **not** Netie.

---

## North star

| Brain | Where it lives | Who unlocks it | Job |
|---|---|---|---|
| **Personal assistant brain** | On device (`%APPDATA%/NetieClicks/memory`) | User device root (DPAPI) + adaptive user KEK | Remembers *this* human: prefs, apps, habits, what worked |
| **Cortex dual brain** | Netie main servers | **Netie Final Boss Key** (HQ private KEK) | Trains the strongest shared models from fleet learning envelopes |

Clicks feeds both. The user never manages keys, never sees crypto, never configures
pipelines. They press **Ctrl+Space**, say what they want, tap **Go**.

---

## Control model (Netie is the authority)

1. **Netie Final Boss Key** — HQ-held private key. All learning envelopes destined for
   dual-brain training include `wrap_netie` under this key (or a fleet processing KEK
   issued by Cortex `/v1/telemetry/register`). Only Netie can open the training corpus.
2. **Device root** — sealed with Windows DPAPI (CurrentUser). Powers the personal brain.
   Users don't know it exists. Lost device / reinstall ⇒ personal vault unreadable (expected).
3. **Adaptive keys** — HKDF-SHA256 binds KEKs to `deviceId` + purpose strings. Rotate by
   bumping version suffixes (`…-v1` → `…-v2`); old envelopes stay openable via version map.
4. **Integrity hashes** — SHA-256 over canonical envelope bytes. Detect tamper. **Not** an unlock.
5. **Action authority** — consequential clicks still need a human OK in the panel (idiot-proof
   one-tap). Secrets/system surfaces stay custody/refuse ([`SAFETY.md`](SAFETY.md)).
6. **Credential authority** — OpenVault owns provider keys. Clicks never holds them.

Netie can process, train, improve, and remotely shape fleet behaviour through Cortex.
Attackers, other vendors, and casual disk theft cannot.

---

## What we collect (maximum useful signal)

Product install = membership in the Netie learning fleet. Learning is **ON by default**
(product capability, not a buried dark pattern — the panel shows “Dual Brain · learning”).
Users who opt out still get the personal brain locally; fleet upload stops.

### Tier map (all dual-wrapped when uploaded)

| Tier | Payload | Pixels? | Dual-brain value | Default |
|---|---|---|---|---|
| **P — Personal notes** | Assistant summaries, prefs, “what worked” | No | Local only (unless user shares feedback) | Always on locally |
| **A — Outcomes** | action_type, tier, approved, succeeded, latency, app_class | No | High — teaches plan quality | Fleet ON |
| **B — Feedback** | thumbs + optional user note | Only typed note | Highest labels | Fleet ON |
| **C — Session sketches** | Redacted UI structure / control labels after Cortex `/dms/secure` PII mask | No raw pixels | High — teaches computer-use | Fleet ON when Cortex online |
| **D — Aggregates** | DP counters | No | Drift | Fleet ON |
| **X — Raw captures** | PNG / OCR dump | Yes | HQ-only vault, time-boxed, never in public train dumps | **HQ research lane only**; gated by `NETIE_HQ_CAPTURE=1` + steward key |

Tier X is optional, env-gated, and sealed so **only** the Final Boss Key opens it. It is
never the default path in consumer builds. Consumer builds ship A+B+C+P.

### Sync timing

Learning envelopes flush:

- on a timer (default 5 min while session armed),
- on app quit,
- **alongside update checks** (same wake-up, **separate** `POST /v1/telemetry` — not stuffed
  inside the update binary). That preserves “upload when we already phone home” without a
  covert channel AV vendors flag as spyware.

---

## Crypto (mythos, but operable)

```
plaintext → AES-256-GCM(DEK)
DEK      → wrap_user  (device user KEK)     → personal brain / export / erase
DEK      → wrap_netie (Final Boss / fleet) → Cortex dual-brain ingest
hash     → SHA-256(canonical)              → tamper evidence only
```

- **Personal brain** always openable on the signed-in Windows user.
- **Fleet / dual brain** openable only by Netie HQ (or Cortex with issued fleet KEK).
- Local redact via Cortex `/dms/secure` before any Tier C sketch leaves the device.
- Transport: TLS to Cortex loopback/prod; egress allowlist; audit every flush.

### Adaptive key schedule

| Key | Derivation |
|---|---|
| `device_root` | `random(32)` sealed DPAPI |
| `user_kek` | `HKDF(root, salt=user-kek-v1, info=deviceId)` |
| `search_hmac` | `HKDF(user_kek, salt=search-v1, info=hmac-index)` |
| `netie_kek` | Issued by Cortex register **or** local fleet seed until register succeeds |
| `final_boss_wrap` | Optional RSA-OAEP/X25519 wrap to `NETIE_MASTER_PUBKEY` for HQ-only Tier X |

---

## Idiot-proof product rules (Clicks)

Users are not operators. Design for that:

1. **One primary verb: Go.** Detect ask vs act; don't make them pick modes.
2. **We plan; they approve once.** Non-irreversible steps pre-checked. Irreversible shout.
3. **Secrets: we never type them.** Custody card: “You do this bit.”
4. **Memory is silent.** Every useful exchange lands in the personal brain automatically.
5. **Dual Brain badge** shows learning state; one tap pauses fleet upload. No key ceremonies.
6. **Fail closed on actions** if Cortex gate is down; answers may degrade open.
7. **Esc / Stop** aborts mid-plan. Always.

---

## Erasure & HQ obligations

- Local delete / export: always available for personal brain (support + trust).
- Opt-out fleet: stop enqueue + purge pending queue + clear local `netie_kek` wrap used for upload.
- HQ corpus: `lineage_id` exclusion on retrain when a device revokes.
- Tier X TTL ≤ 14 days unless a steward pin extends it.

---

## Netie Clicks build map

| Module | Role |
|---|---|
| `electron/netie/safety.js` | What may auto / approve / custody / refuse |
| `electron/netie/ecosystem.js` | Cortex gate + audit + OpenVault LLM |
| `electron/netie/crypto/*` | AEAD, HKDF, dual envelope, vault |
| `electron/netie/memory/*` | Personal assistant brain |
| `electron/netie/telemetry/*` | Fleet learning queue → `/v1/telemetry` |
| `electron/netie/brain.js` | Façade main.js uses |
| `electron/netie/intent.js` | Ask vs Do classifier for one-tap Go |
| Panel | Go / plan review / Dual Brain badge |

---

## Non-goals (still)

- Giving **other companies** keys to our corpus.
- Shipping provider API keys inside the Electron app.
- Letting on-screen text command the agent (always Cortex-gated).
- Autonomous irreversible money/delete without a human tap.

Everything else that makes Netie the strongest dual brain + personal assistant — **allowed
and preferred**.
