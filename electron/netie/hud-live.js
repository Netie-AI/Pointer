/**
 * HUD live layer — the logic behind HUD-01..06, kept out of the renderer.
 *
 * `hud.js` is a browser script: it cannot be `require`d, so anything that lives
 * there can only ever be tested by grepping the file, and a grep will happily
 * certify a feature that is wired to nothing. Everything here is the real code
 * the HUD runs, loaded as a plain <script> in `hud.html` and as a CommonJS
 * module in `test/acceptance/hud-live.test.js`. The renderer keeps only DOM
 * plumbing.
 *
 * No timers are started in here. The countdown is driven by an explicit clock
 * the caller passes in, because a test that has to sleep to observe a deadline
 * is a test that will flake on a loaded machine.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NetieHudLive = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Long enough to hear yourself finish, short enough to feel automatic. */
  const AUTO_SEND_MS = 4000;
  /** Speech is bursty — wait for a gap before summarising, or every clause fires. */
  const INSIGHT_WINDOW_MS = 3500;

  const SOURCE_LABELS = Object.freeze({ mic: "You", system: "Screen" });

  // ── HUD-01 · drag ─────────────────────────────────────────────────────────
  /**
   * Offset bookkeeping for the draggable panels (LIVE subtitle, chat, insights).
   *
   * Screen coordinates, not client coordinates: the HUD is a full-display
   * click-through window, so a pointermove that leaves the panel still has to
   * move it. One controller owns every panel so two drags can never fight.
   */
  function createDragController() {
    const offsets = new Map();
    let active = null;

    const offsetOf = (target) => {
      const o = offsets.get(target);
      return o ? { x: o.x, y: o.y } : { x: 0, y: 0 };
    };

    return {
      offset: offsetOf,
      get dragging() {
        return Boolean(active);
      },
      get target() {
        return active ? active.target : null;
      },
      begin(target, point) {
        if (!target || !point) return false;
        active = {
          target,
          startX: Number(point.x) || 0,
          startY: Number(point.y) || 0,
          origin: offsetOf(target),
        };
        return true;
      },
      move(point) {
        if (!active || !point) return null;
        const next = {
          x: active.origin.x + ((Number(point.x) || 0) - active.startX),
          y: active.origin.y + ((Number(point.y) || 0) - active.startY),
        };
        offsets.set(active.target, next);
        return { target: active.target, offset: { x: next.x, y: next.y } };
      },
      end() {
        const was = active;
        active = null;
        return was ? was.target : null;
      },
      reset(target) {
        if (target) offsets.delete(target);
        else offsets.clear();
        active = null;
      },
    };
  }

  // ── HUD-02 · auto-send countdown ──────────────────────────────────────────
  /**
   * Arm a countdown after speech goes final; fire the instruction when it runs
   * out unless the human cancels.
   *
   * Cancel is absolute. Once cancelled the armed text is dropped and `tick` can
   * never fire it — a countdown that resurrects itself would send words the
   * user explicitly took back, which is the one failure this control exists to
   * prevent.
   */
  function createAutoSend(opts) {
    const cfg = opts || {};
    const delayMs = Number(cfg.delayMs) > 0 ? Number(cfg.delayMs) : AUTO_SEND_MS;
    const onTick = typeof cfg.onTick === "function" ? cfg.onTick : () => {};
    const onFire = typeof cfg.onFire === "function" ? cfg.onFire : () => {};
    const onCancel = typeof cfg.onCancel === "function" ? cfg.onCancel : () => {};

    let armed = false;
    let deadline = 0;
    let text = "";

    function state(nowMs) {
      return {
        armed,
        text,
        remainingMs: armed ? Math.max(0, deadline - nowMs) : 0,
      };
    }

    return {
      get armed() {
        return armed;
      },
      get text() {
        return text;
      },
      remainingMs(nowMs) {
        return armed ? Math.max(0, deadline - (Number(nowMs) || 0)) : 0;
      },
      /**
       * More speech restarts the clock and accumulates — two sentences are one
       * instruction, and the second must not be truncated by the first's timer.
       */
      arm(nextText, nowMs) {
        const clean = String(nextText || "").trim();
        if (!clean) return state(Number(nowMs) || 0);
        text = armed && text ? `${text} ${clean}` : clean;
        deadline = (Number(nowMs) || 0) + delayMs;
        armed = true;
        const s = state(Number(nowMs) || 0);
        onTick(s);
        return s;
      },
      cancel(reason) {
        if (!armed) return { cancelled: false, reason: reason || "idle" };
        const dropped = text;
        armed = false;
        deadline = 0;
        text = "";
        onCancel({ reason: reason || "user", text: dropped });
        return { cancelled: true, reason: reason || "user", text: dropped };
      },
      /** @returns {{fired:boolean, text?:string}} */
      tick(nowMs) {
        const now = Number(nowMs) || 0;
        if (!armed) return { fired: false };
        if (now < deadline) {
          onTick(state(now));
          return { fired: false, remainingMs: deadline - now };
        }
        const sending = text;
        armed = false;
        deadline = 0;
        text = "";
        onFire({ text: sending });
        return { fired: true, text: sending };
      },
    };
  }

  // ── HUD-06 · one LIVE line from mic + system audio ────────────────────────
  /**
   * Mic and Windows loopback used to write to two different places, so a meeting
   * showed your words in the chat and the other side's in the subtitle bar with
   * no way to read them as one conversation. This merges both into a single
   * ordered line, newest last, each side labelled.
   */
  function createLiveLine(opts) {
    const cfg = opts || {};
    const maxChars = Number(cfg.maxChars) > 0 ? Number(cfg.maxChars) : 240;
    const parts = new Map(); // source -> text, insertion order == recency

    function render() {
      const out = [];
      for (const [source, value] of parts) {
        if (!value) continue;
        out.push(`${SOURCE_LABELS[source] || source}: ${value}`);
      }
      const line = out.join("  ·  ");
      return line.length > maxChars ? `…${line.slice(line.length - maxChars + 1)}` : line;
    }

    return {
      push(source, text) {
        const key = source === "system" ? "system" : "mic";
        const clean = String(text || "").trim();
        parts.delete(key); // re-insert so Map order tracks recency
        if (clean) parts.set(key, clean);
        return render();
      },
      clear(source) {
        if (source) parts.delete(source === "system" ? "system" : "mic");
        else parts.clear();
        return render();
      },
      get sources() {
        return Array.from(parts.keys());
      },
      render,
    };
  }

  /**
   * A rolling multi-line transcript for the LIVE bar.
   *
   * `createLiveLine` above merges the two sources into ONE line — right for a
   * compact status strip, useless for following a video, where the interesting
   * thing is the last several sentences in order. This keeps the last N
   * utterances with their source, newest last, and never merges two speakers
   * into one entry.
   */
  function createLiveTranscript(opts) {
    const cfg = opts || {};
    const maxLines = Number(cfg.maxLines) > 0 ? Number(cfg.maxLines) : 5;
    const maxCharsPerLine = Number(cfg.maxCharsPerLine) > 0 ? Number(cfg.maxCharsPerLine) : 160;
    let entries = [];

    function clip(text) {
      return text.length > maxCharsPerLine ? `${text.slice(0, maxCharsPerLine - 1)}…` : text;
    }

    return {
      /**
       * @param {"mic"|"system"} source
       * @param {string} text
       * @param {{partial?:boolean}} [meta] partials replace the pending tail
       *   rather than stacking, so a sentence being recognised does not eat the
       *   whole window one word at a time.
       */
      push(source, text, meta) {
        const key = source === "system" ? "system" : "mic";
        const clean = String(text || "").trim();
        if (!clean) return this.lines();
        const partial = Boolean(meta && meta.partial);
        const tail = entries[entries.length - 1];
        if (tail && tail.partial && tail.source === key) entries.pop();
        entries.push({ source: key, text: clip(clean), partial });
        if (entries.length > maxLines) entries = entries.slice(-maxLines);
        return this.lines();
      },
      /** @returns {{source:string,text:string,label:string,partial:boolean}[]} */
      lines() {
        return entries.map((e) => ({
          source: e.source,
          text: e.text,
          label: SOURCE_LABELS[e.source] || e.source,
          partial: e.partial,
        }));
      },
      render() {
        return entries.map((e) => `${SOURCE_LABELS[e.source] || e.source}: ${e.text}`).join("\n");
      },
      clear(source) {
        entries = source ? entries.filter((e) => e.source !== (source === "system" ? "system" : "mic")) : [];
        return this.lines();
      },
      get size() {
        return entries.length;
      },
      get maxLines() {
        return maxLines;
      },
    };
  }

  /**
   * Compact HUD cue captions: last system STT lines that are not already
   * They asked or Them on the bar. Never a floating LIVE bar, never Act.
   */
  function cueCaptionLines(lines, opts) {
    const cfg = opts || {};
    const max = Number(cfg.max) > 0 ? Number(cfg.max) : 2;
    const asked = String(cfg.asked || "").trim();
    const them = String(cfg.them || "").trim();
    const out = [];
    const rows = Array.isArray(lines) ? lines : [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.source !== "system") continue;
      const text = String(row.text || "").trim();
      if (!text) continue;
      if (text === asked || text === them) continue;
      out.push({
        text: text.slice(0, 160),
        partial: Boolean(row.partial),
      });
    }
    return out.slice(-max);
  }

  /**
   * Same Live strip from a stored You/Them ring when STT is quiet.
   * Skips They asked and the last Them line. Never Act.
   */
  function cueCaptionTurns(turns, opts) {
    const cfg = opts || {};
    const max = Number(cfg.max) > 0 ? Number(cfg.max) : 2;
    const asked = String(cfg.asked || "").trim();
    const them = String(cfg.them || "").trim();
    const out = [];
    const rows = Array.isArray(turns) ? turns : [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.speaker === "you") continue;
      const text = String(row.text || "").trim();
      if (!text || text === asked || text === them) continue;
      out.push({ text: text.slice(0, 160) });
    }
    return out.slice(-max);
  }

  // ── HUD-05 · live insights from speech ────────────────────────────────────
  const STOPWORDS = new Set([
    "the", "a", "an", "and", "or", "but", "if", "then", "so", "to", "of", "in",
    "on", "for", "with", "is", "are", "was", "were", "be", "been", "it", "its",
    "this", "that", "these", "those", "i", "you", "we", "they", "he", "she",
    "me", "my", "our", "your", "just", "like", "okay", "ok", "yeah", "well",
    "gonna", "really", "very", "about", "have", "has", "had", "do", "does",
    "did", "not", "no", "yes", "can", "will", "would", "should", "could",
    "there", "here", "what", "how", "why", "when", "them", "from", "at", "as",
  ]);

  /**
   * A local, deterministic read of what is being discussed — no network, no key,
   * so insights still appear when OpenVault is down. The main process may
   * overwrite the panel with a model-written summary; this is the floor, not
   * the ceiling.
   */
  function summarizeSpeech(bits) {
    const lines = (Array.isArray(bits) ? bits : [bits])
      .map((b) => String(b || "").trim())
      .filter(Boolean);
    if (!lines.length) return null;

    const joined = lines.join(" ");
    const counts = new Map();
    for (const word of joined.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []) {
      if (STOPWORDS.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    const ranked = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([w]) => w);

    // Last two sentences read as "where we are now"; earlier ones are history.
    const sentences = joined.split(/(?<=[.!?])\s+/).filter(Boolean);
    const tail = sentences.slice(-2).join(" ").trim() || joined;

    return {
      topic: ranked.length ? ranked.join(" · ") : "Discussion",
      summary: tail.length > 300 ? `${tail.slice(0, 299)}…` : tail,
      keywords: ranked,
      lines: lines.length,
    };
  }

  /**
   * Debounce speech into insights. Speech arrives clause by clause; summarising
   * every clause would repaint the panel three times a sentence and read as
   * noise, so nothing is emitted until the talking pauses.
   */
  function createInsightFeed(opts) {
    const cfg = opts || {};
    const windowMs = Number(cfg.windowMs) > 0 ? Number(cfg.windowMs) : INSIGHT_WINDOW_MS;
    const minChars = Number(cfg.minChars) >= 0 ? Number(cfg.minChars) : 24;
    const maxLines = Number(cfg.maxLines) > 0 ? Number(cfg.maxLines) : 12;
    const onInsight = typeof cfg.onInsight === "function" ? cfg.onInsight : () => {};

    let bits = [];
    let lastPushAt = 0;
    let chars = 0;

    return {
      get pending() {
        return bits.length;
      },
      push(text, nowMs) {
        const clean = String(text || "").trim();
        if (!clean) return false;
        bits.push(clean);
        if (bits.length > maxLines) bits = bits.slice(-maxLines);
        chars += clean.length;
        lastPushAt = Number(nowMs) || 0;
        return true;
      },
      /** Quiet for a full window, and enough said to be worth summarising. */
      due(nowMs) {
        if (!bits.length) return false;
        if (chars < minChars) return false;
        return (Number(nowMs) || 0) - lastPushAt >= windowMs;
      },
      flush(nowMs) {
        if (!this.due(nowMs)) return null;
        const insight = summarizeSpeech(bits);
        bits = [];
        chars = 0;
        if (insight) onInsight(insight);
        return insight;
      },
      reset() {
        bits = [];
        chars = 0;
        lastPushAt = 0;
      },
    };
  }

  // ── HUD-04 · re-arm the mic after "Do it" ─────────────────────────────────
  /**
   * Acting used to end the conversation: the plan ran, capture stayed wherever
   * it was, and the follow-up ("no, the other one") fell on a dead mic. If the
   * user was talking to Netie, Netie keeps listening — unless they paused it,
   * which is an explicit "stop hearing me" and outranks convenience.
   */
  function shouldRearmAfterAct(state) {
    const s = state || {};
    if (s.paused === true) return { mic: false, system: false, reason: "paused" };
    const listening = s.listening === true;
    const modeListens = s.mode === "transcribe" || s.mode === "meeting" || s.mode === "general";
    if (!listening && !modeListens) return { mic: false, system: false, reason: "mic-off" };
    return {
      mic: true,
      system: s.systemAudio === true || s.mode === "meeting",
      reason: listening ? "was-listening" : `mode:${s.mode}`,
    };
  }

  // ── #25 · hold-to-talk ────────────────────────────────────────────────────
  /**
   * Hold a control, talk, release, get a transcript in the command bar.
   *
   * The gesture is trivial; the release lifecycle is the whole ticket. A hold
   * that loses its keyup — the window blurs, the customer alt-tabs mid-hold, the
   * pointer is cancelled by a system gesture — leaves the microphone recording
   * with nothing on screen saying so. That is a privacy defect, not a bug, so:
   *
   *   - `end()` is idempotent and safe to call from every one of those paths.
   *   - a watchdog stops capture even if no release event ever arrives.
   *   - `begin()` refuses when no engine is available, rather than capturing
   *     audio that goes nowhere (KB R-0011 — a silent no-op is a lie).
   *   - state changes are announced through `onState`, so the recording
   *     indicator can never disagree with whether the mic is actually open.
   *
   * No timers are created until a hold starts, and the clock is injected, so
   * the watchdog can be tested without sleeping.
   *
   * @param {{start:function, stop:function, engineAvailable:function,
   *          onState?:function, maxMs?:number, setTimer?:function,
   *          clearTimer?:function}} deps
   */
  function createHoldToTalk(deps) {
    const {
      start,
      stop,
      engineAvailable,
      onState = () => {},
      maxMs = 120000,
      setTimer = setTimeout,
      clearTimer = clearTimeout,
    } = deps || {};

    let holding = false;
    let watchdog = null;
    let generation = 0;

    function announce(state, detail) {
      onState({ state, holding, detail: detail || "" });
    }

    function clearWatchdog() {
      if (watchdog != null) {
        clearTimer(watchdog);
        watchdog = null;
      }
    }

    async function begin(reason = "press") {
      if (holding) return { ok: true, already: true };
      // Claim a generation BEFORE the first await. A release can land while the
      // engine probe is still in flight — pointerdown/pointerup inside one
      // animation frame is an ordinary fast tap — and if `begin` only checked
      // `holding`, that release would be a no-op and the mic would open after
      // the gesture was already over.
      const mine = ++generation;
      const engine = await engineAvailable();
      if (mine !== generation) {
        return { ok: false, reason: "released before capture opened" };
      }
      if (!engine || engine.ok === false) {
        // Say it AT the control. The customer is holding a button; a console
        // line they cannot see is not an answer.
        announce("unavailable", (engine && engine.reason) || "no transcription engine");
        return { ok: false, reason: (engine && engine.reason) || "no transcription engine" };
      }
      holding = true;
      announce("holding", reason);
      const started = await start(reason);
      // The hold may have ended while start() was in flight; do not leave a
      // capture running for a gesture that is already over.
      if (!holding || mine !== generation) {
        await stop("raced");
        return { ok: false, reason: "released before capture opened" };
      }
      if (!started || started.ok === false) {
        holding = false;
        announce("unavailable", (started && started.error) || "mic unavailable");
        return { ok: false, reason: (started && started.error) || "mic unavailable" };
      }
      clearWatchdog();
      watchdog = setTimer(() => {
        // No release ever arrived. Stop anyway and say why.
        end("watchdog");
      }, maxMs);
      return { ok: true };
    }

    /** Idempotent. Every hard-stop path calls this and none of them coordinate. */
    async function end(reason = "release") {
      clearWatchdog();
      // Bump unconditionally, even when nothing is holding: an in-flight
      // `begin()` compares against this to learn it was released mid-await.
      generation += 1;
      if (!holding) return { ok: true, already: true };
      holding = false;
      announce("stopping", reason);
      await stop(reason);
      announce("idle", reason);
      return { ok: true, reason };
    }

    return {
      begin,
      end,
      get holding() {
        return holding;
      },
      /** Every event that must be treated as a hard stop. */
      hardStopEvents: ["pointerup", "pointercancel", "pointerleave", "blur", "visibilitychange"],
    };
  }

  return {
    AUTO_SEND_MS,
    INSIGHT_WINDOW_MS,
    SOURCE_LABELS,
    createHoldToTalk,
    createDragController,
    createAutoSend,
    createLiveLine,
    createLiveTranscript,
    cueCaptionLines,
    cueCaptionTurns,
    createInsightFeed,
    summarizeSpeech,
    shouldRearmAfterAct,
  };
});
