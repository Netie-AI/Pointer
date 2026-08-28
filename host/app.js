function show(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * Loopback catalog stays current while the tab is open.
 * Public localFirst snapshots are empty and must not poll.
 */
function isDemoPage() {
  try {
    return /(?:^|[?&])demo=1(?:&|$)/.test(String(location.search || ""));
  } catch {
    return false;
  }
}

let demoCatalogOn = false;
let paintingDemo = false;
function isDemoCatalog() {
  return isDemoPage() || demoCatalogOn;
}

function demoHref(path) {
  const href = String(path || "");
  if (!isDemoPage()) return href;
  if (/[?&]demo=1(?:&|$)/.test(href)) return href;
  return href.indexOf("?") >= 0 ? href + "&demo=1" : href + "?demo=1";
}

function paintDemoIfPublic(snapshot) {
  if (paintingDemo) return false;
  if (demoCatalogOn) return true;
  if (snapshot && snapshot.exec) return false;
  if (isDemoPage() || (snapshot && snapshot.localFirst)) {
    applyDemoCatalog();
    return true;
  }
  return false;
}

let lastSpokenTeach = "";
function speakTeachCue(line) {
  const text = String(line || "")
    .replace(/^\d+\s+of\s+\d+\s+/i, "")
    .trim();
  if (!text || text === lastSpokenTeach) return;
  if (typeof document !== "undefined" && document.hidden) return;
  const synth = typeof window !== "undefined" && window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;
  lastSpokenTeach = text;
  try {
    synth.cancel();
    synth.speak(new SpeechSynthesisUtterance(text));
  } catch {
    lastSpokenTeach = "";
  }
}

function pollWhileLive(load) {
  if (isDemoPage()) return;
  let timer = null;
  function tick() {
    if (typeof document !== "undefined" && document.hidden) return;
    if (isDemoCatalog()) {
      arm(false);
      return;
    }
    load();
  }
  function arm(keep) {
    if (keep === false) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      return;
    }
    if (!timer) timer = setInterval(tick, 2500);
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) arm(false);
      else {
        Promise.resolve()
          .then(load)
          .then(arm)
          .catch(function () { arm(false); });
      }
    });
  }
  Promise.resolve()
    .then(load)
    .then(arm)
    .catch(function () { arm(false); });
}

function paintDesks(desks) {
  const root = document.getElementById("desks");
  if (!root || !isWorkspacePage()) return;
  root.replaceChildren();
  (desks || []).forEach((d) => {
    const card = el("article", "desk");
    const h = el("h3");
    h.textContent = (d.label || d.id || "desk") + (d.parked ? " (parked)" : "");
    const job = el("p");
    job.textContent = d.job || "";
    const out = el("p", "muted");
    out.textContent = (d.deliverable || "") + " Act: " + (d.act || "never") + ".";
    card.appendChild(h);
    card.appendChild(job);
    card.appendChild(out);
    root.appendChild(card);
  });
}

function paintEvents(events) {
  const root = document.getElementById("events");
  if (!root) return;
  root.replaceChildren();
  if (!events || !events.length) {
    const li = el("li", "muted");
    li.textContent = "No session events on this host. Open 127.0.0.1:18010/today while Pointer is running.";
    root.appendChild(li);
    return;
  }
  events.forEach((row) => {
    const li = el("li");
    li.textContent = (row.kind || "note") + " · " + (row.detail || "");
    root.appendChild(li);
  });
}

function paintBrief(text, desk, localFirst) {
  const root = document.getElementById("brief");
  if (!root) return;
  root.replaceChildren();
  const pre = el("pre");
  pre.textContent = text || "";
  root.appendChild(pre);
  setBriefButtons(text, desk || "today", localFirst);
}

function paintArtifacts(items) {
  artifactCache = Array.isArray(items) ? items.slice() : [];
  renderArtifactList();
}

let artifactCache = [];
let lastOpenId = "";
let lastOpenTitle = "";
let lastSessionFiles = [];
let openedQueryId = false;

function workspaceQueryId() {
  try {
    return String(new URLSearchParams(location.search).get("id") || "").trim();
  } catch {
    return "";
  }
}

function isWorkspacePage() {
  const p = String((typeof location !== "undefined" && location.pathname) || "/").replace(/\/+$/, "") || "/";
  return p === "/workspace";
}

function sessionTileKind(row) {
  const id = String((row && row.id) || "").toLowerCase();
  const desk = String((row && row.desk) || "").toLowerCase();
  if (desk === "document" || id === "live-document") return "Word file";
  if (desk === "inbox" || id === "live-inbox") return "Unsent mail";
  if (desk === "security" || id === "live-security") return "Review";
  if (desk === "teach") return "Teach walk";
  if (desk === "meeting") return "Meeting";
  if (desk === "today") return "Today";
  return desk || "File";
}

function paintSessionTile(row) {
  const id = String((row && row.id) || "").trim();
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return null;
  const tile = el("button", id === lastOpenId ? "session-tile open" : "session-tile");
  tile.type = "button";
  const kind = el("p", "session-tile-kind");
  kind.textContent = sessionTileKind(row);
  const title = el("p", "session-tile-title");
  title.textContent = String((row && row.title) || id).slice(0, 48);
  tile.appendChild(kind);
  tile.appendChild(title);
  const cueText = String((row && row.cue) || "").trim();
  if (cueText) {
    const extra = el("p", "muted");
    extra.textContent = cueText.slice(0, 80);
    tile.appendChild(extra);
  }
  tile.addEventListener("click", function () {
    if (isWorkspacePage()) openArtifact(id);
    else location.href = sessionLinkHref(row);
  });
  return tile;
}

function sessionLinkHref(row) {
  const href = String((row && row.href) || "").trim();
  if (/^\/(workspace|meeting|teach|today|document|security|inbox)(\?id=[A-Za-z0-9._-]+)?$/.test(href)) {
    return demoHref(href);
  }
  const desk = String((row && row.desk) || "");
  if (
    desk === "teach" ||
    desk === "meeting" ||
    desk === "today" ||
    desk === "document" ||
    desk === "security" ||
    desk === "inbox"
  ) {
    return demoHref("/" + desk);
  }
  return demoHref("/workspace");
}

function paintWorkingSet() {
  const bar = document.getElementById("live-cue-bar");
  if (!bar) return;
  let chip = document.getElementById("host-open");
  if (!chip) {
    chip = el("p", "live-cue-open");
    chip.id = "host-open";
    const form = document.getElementById("host-ask-form");
    if (form && form.parentNode) form.parentNode.insertBefore(chip, form);
    else bar.appendChild(chip);
  }
  chip.hidden = !lastOpenId;
  chip.textContent = lastOpenId ? "Open: " + (lastOpenTitle || lastOpenId) : "";
  const input = document.getElementById("host-ask");
  if (input) {
    input.placeholder = lastOpenId
      ? "Ask about " + (lastOpenTitle || lastOpenId) + " (never Act)"
      : "Ask the coworker (never Act)";
  }
}

function setWorkingSet(id, title) {
  lastOpenId = String(id || "").trim();
  lastOpenTitle = String(title || lastOpenId || "").trim();
  if (isWorkspacePage() && typeof history !== "undefined" && history.replaceState) {
    try {
      const url = new URL(location.href);
      if (lastOpenId) url.searchParams.set("id", lastOpenId);
      else url.searchParams.delete("id");
      history.replaceState({}, "", url.pathname + url.search);
    } catch {
      /* ignore */
    }
  }
  paintWorkingSet();
  paintOpenFileHero();
  renderArtifactList();
}

function paintOpenFileHero() {
  const main = document.querySelector("main");
  if (!main || !isWorkspacePage()) return;
  main.classList.toggle("workspace-open-file", Boolean(lastOpenId));
  const win = document.getElementById("open-file");
  if (win) win.hidden = !lastOpenId;
  paintOpenFileTabs();
}

function paintOpenFileTabs(files) {
  const root = document.getElementById("open-file-tabs");
  if (!root) return;
  if (Array.isArray(files)) lastSessionFiles = files;
  root.replaceChildren();
  if (!lastOpenId || !lastSessionFiles.length) {
    root.hidden = true;
    return;
  }
  lastSessionFiles.slice(0, 8).forEach(function (row) {
    const id = String((row && row.id) || "").trim();
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return;
    const btn = el("button", id === lastOpenId ? "open-file-tab open" : "open-file-tab");
    btn.type = "button";
    btn.textContent = String((row && row.title) || id).slice(0, 40);
    btn.addEventListener("click", function () {
      openArtifact(id);
    });
    root.appendChild(btn);
  });
  root.hidden = !root.childNodes.length;
}

function renderArtifactList() {
  const root = document.getElementById("artifacts");
  if (!root) return;
  const q = String((document.getElementById("artifact-filter") || {}).value || "")
    .toLowerCase()
    .trim();
  const items = q
    ? artifactCache.filter((row) =>
        `${row.title || ""} ${row.desk || ""} ${row.id || ""}`.toLowerCase().includes(q)
      )
    : artifactCache;
  root.replaceChildren();
  if (!items.length) {
    const li = el("li", "muted");
    li.textContent = artifactCache.length
      ? "No artifacts match that filter."
      : "No artifacts on this host. Live briefs stay on 127.0.0.1:18010.";
    root.appendChild(li);
    return;
  }
  items.forEach((row) => {
    const li = el("li");
    const btn = el("button", lastOpenId && row.id === lastOpenId ? "artifact open" : "artifact");
    btn.type = "button";
    btn.textContent = (row.title || row.id || "untitled") + " · " + (row.desk || "desk");
    btn.addEventListener("click", () => openArtifact(row.id));
    li.appendChild(btn);
    root.appendChild(li);
  });
}

function setFinishedDownloads(art, flags) {
  const localFirst = Boolean(flags && flags.localFirst);
  const exec = Boolean(flags && flags.exec);
  const desk = String((art && art.desk) || "").toLowerCase();
  const id = String((art && art.id) || "").toLowerCase();
  const preview = String((art && art.preview) || "").trim();
  const body = String((art && (art.body || art.deliverable)) || "");
  const hasDocxDraft = Boolean(preview) || /## Draft to write[\s\S]*\S/.test(body);
  const hasEmlDraft = Boolean(preview) || /^## Draft\b(?! to write)/m.test(body);
  const hasDraft = !localFirst && !exec && (desk === "inbox" || id === "live-inbox" ? hasEmlDraft : hasDocxDraft);
  const hasReview =
    Boolean(String((art && (art.body || art.deliverable || art.preview)) || "").trim()) && !localFirst && !exec;
  const showDocx = hasDraft && (desk === "document" || id === "live-document");
  const showEml = hasDraft && (desk === "inbox" || id === "live-inbox");
  const showReport = hasReview && (desk === "security" || id === "live-security");
  const docxBtn = document.getElementById("docx-download");
  const emlBtn = document.getElementById("eml-download");
  const reportBtn = document.getElementById("report-download");
  if (docxBtn) docxBtn.hidden = !showDocx;
  if (emlBtn) emlBtn.hidden = !showEml;
  if (reportBtn) reportBtn.hidden = !showReport;
  const kick = document.getElementById("open-file-kicker");
  if (kick) {
    kick.hidden = !(showDocx || showEml || showReport);
    kick.textContent = showDocx ? "Finished file" : showEml ? "Unsent file" : showReport ? "Not approval" : "";
  }
}

function paintOpenPre(root, text) {
  if (!root) return;
  const pre = el("pre");
  pre.textContent = String(text || "");
  root.appendChild(pre);
}

function applyOpenTeach(root, m) {
  if (!root) return false;
  root.replaceChildren();
  paintTeachMap(root, m, {
    draw: true,
    apply: function (next) {
      applyOpenTeach(root, next);
    },
  });
  paintOpenPre(root, String((m && m.deliverable) || ""));
  lastArtifactText = String((m && m.deliverable) || lastArtifactText || "");
  return !(m && m.localFirst);
}

function applyOpenMeeting(root, m) {
  if (!root) return false;
  root.replaceChildren();
  paintMeetingCard(root, m);
  paintTalk(root, m);
  paintOpenPre(root, String((m && m.deliverable) || ""));
  lastArtifactText = String((m && m.deliverable) || lastArtifactText || "");
  return !(m && m.localFirst);
}

function paintDeskWindow(root, spec) {
  if (!root || !spec) return;
  const win = el("article", "desk-window " + String(spec.cls || "").trim());
  const kicker = el("p", "desk-window-kicker");
  kicker.textContent = String(spec.kicker || "");
  win.appendChild(kicker);
  if (spec.title) {
    const h = el("h2", "desk-window-title");
    h.textContent = String(spec.title).slice(0, 80);
    win.appendChild(h);
  }
  (spec.rows || []).forEach(function (row) {
    const p = el("p", "desk-window-row");
    const lab = el("span");
    lab.textContent = String((row && row.label) || "");
    const val = document.createElement("b");
    val.textContent = String((row && row.value) || "");
    if (String((row && row.label) || "") === "To" && String((row && row.value) || "") && String((row && row.value) || "") !== "not sent") {
      p.classList.add("typed");
    }
    p.appendChild(lab);
    p.appendChild(val);
    win.appendChild(p);
  });
  if (Array.isArray(spec.hits) && spec.hits.length) {
    const list = el("ul", "work-hits");
    spec.hits.forEach(function (line) {
      const li = el("li");
      li.textContent = String(line || "").slice(0, 160);
      list.appendChild(li);
    });
    win.appendChild(list);
  }
  if (spec.body) {
    const pre = el("pre", "desk-window-body");
    pre.textContent = String(spec.body);
    win.appendChild(pre);
  }
  if (spec.foot) {
    const foot = el("p", "desk-window-foot");
    foot.textContent = String(spec.foot);
    win.appendChild(foot);
  }
  if (spec.href) {
    const a = el("a", "work-card-open desk-window-open");
    a.href = spec.href;
    a.textContent = spec.hrefLabel || "Open in workspace";
    win.appendChild(a);
  }
  root.appendChild(win);
}

function inboxWindowBody(text, preview) {
  const parts = String(text || "").split(/^## /m);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!/^Draft\b/.test(part) || /^Draft to write\b/.test(part)) continue;
    const rest = part.replace(/^Draft[^\n]*\n?/, "");
    const cut = rest.search(/\n---/);
    const out = (cut >= 0 ? rest.slice(0, cut) : rest).trim();
    if (out) return out.slice(0, 1500);
  }
  return String(preview || "").trim().slice(0, 1500);
}

function notesPaper(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let skippedHead = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!skippedHead) {
      if (
        /^#\s/.test(line) ||
        /^kind:\s/i.test(line) ||
        /^source:\s/i.test(line) ||
        /^act:\s/i.test(line) ||
        /^>\s/.test(line) ||
        !String(line || "").trim()
      ) {
        continue;
      }
      skippedHead = true;
    }
    out.push(line);
  }
  const cut = out.join("\n").trim();
  return cut || String(text || "").trim();
}

function notesWindowBody(text, preview) {
  const body = String(text || "");
  const idx = body.indexOf("## Draft to write");
  let raw = "";
  if (idx >= 0) {
    let rest = body.slice(idx + "## Draft to write".length);
    const how = rest.search(/\n## How\b/);
    if (how >= 0) rest = rest.slice(0, how);
    raw = rest.trim();
  }
  if (!raw) raw = String(preview || "").trim();
  return notesPaper(raw).slice(0, 1500);
}

function inboxComposeBody(draft) {
  return String(draft || "")
    .replace(/^To:\s*.+\n?/m, "")
    .replace(/^Subject:\s*.+\n?/m, "")
    .replace(/^\n+/, "");
}

function applyOpenDocument(root, art, text) {
  if (!root) return;
  root.replaceChildren();
  const body = notesWindowBody(text, art && art.preview) || String(text || "").trim();
  paintDeskWindow(root, {
    cls: "desk-document",
    kicker: "Notes",
    title: String((art && art.title) || "Document draft").slice(0, 80),
    body: body,
    foot: "not a .docx - Word.app still needs Cortex",
    href: art && art.href,
  });
}

function applyOpenInbox(root, art, text) {
  if (!root) return;
  root.replaceChildren();
  const draft = inboxWindowBody(text, art && art.preview) || String(text || "").trim();
  let to = "not sent";
  let subject = String((art && art.title) || "Draft follow-up (not sent)").slice(0, 80);
  const toM = draft.match(/^To:\s*(.+)$/m);
  const subM = draft.match(/^Subject:\s*(.+)$/m);
  if (toM) to = String(toM[1] || "").trim().slice(0, 80) || to;
  if (subM) subject = String(subM[1] || "").trim().slice(0, 80) || subject;
  paintDeskWindow(root, {
    cls: "desk-inbox",
    kicker: "Unsent mail",
    rows: [
      { label: "To", value: to },
      { label: "Subject", value: subject },
    ],
    body: inboxComposeBody(draft),
    foot: /saved on this computer/i.test(String((art && art.cue) || ""))
      ? "saved on This computer - send is parked (P-05)"
      : "not sent - send is parked (P-05)",
    href: art && art.href,
  });
}

function applyOpenSecurity(root, art, text) {
  if (!root) return;
  root.replaceChildren();
  const m = {
    desk: "security",
    localFirst: false,
    cue: art && art.cue,
    deliverable: text,
    findings: art && art.findings,
  };
  const hits = findingItems(m);
  const verdict = sectionAfter(text, "Verdict").join(" ").trim().slice(0, 240);
  paintDeskWindow(root, {
    cls: "desk-security",
    kicker: "Needs you",
    title: String((art && art.cue) || "Security review").slice(0, 80),
    hits: hits,
    body: verdict,
    foot: "do not approve",
    href: art && art.href,
  });
}

function applyOpenToday(root, m, text) {
  if (!root) return false;
  root.replaceChildren();
  paintTodayPlate(root, m);
  if (!root.childNodes.length) paintOpenPre(root, text);
  lastArtifactText = String((m && m.deliverable) || text || lastArtifactText || "");
  return !(m && m.localFirst);
}

function paintOpenFileBody(root, body, text) {
  const art = body && body.artifact;
  const desk = String((art && art.desk) || "").toLowerCase();
  const id = String((art && art.id) || "").toLowerCase();
  if (isDemoCatalog()) {
    const home = demoHome();
    if (desk === "teach" || id === "live-teach") {
      applyOpenTeach(root, home.rooms.teach);
      return;
    }
    if (desk === "meeting" || id === "live-meeting") {
      applyOpenMeeting(root, home.rooms.meeting);
      return;
    }
    if (desk === "today" || id === "standing-today") {
      applyOpenToday(root, home.rooms.today, text);
      return;
    }
  }
  if (desk === "teach" || id === "live-teach") {
    fetch("/api/teach")
      .then(function (r) {
        return r.json();
      })
      .then(function (m) {
        applyOpenTeach(root, m);
      })
      .catch(function () {
        paintOpenPre(root, text);
      });
    return;
  }
  if (desk === "meeting" || id === "live-meeting") {
    fetch("/api/meeting")
      .then(function (r) {
        return r.json();
      })
      .then(function (m) {
        applyOpenMeeting(root, m);
      })
      .catch(function () {
        paintOpenPre(root, text);
      });
    return;
  }
  if (desk === "document" || id === "live-document") {
    applyOpenDocument(root, art, text);
    return;
  }
  if (desk === "inbox" || id === "live-inbox") {
    applyOpenInbox(root, art, text);
    return;
  }
  if (desk === "security" || id === "live-security") {
    applyOpenSecurity(root, art, text);
    return;
  }
  if (desk === "today" || id === "standing-today") {
    fetch("/api/today")
      .then(function (r) {
        return r.json();
      })
      .then(function (m) {
        applyOpenToday(root, m, text);
      })
      .catch(function () {
        paintOpenPre(root, text);
      });
    return;
  }
  paintOpenPre(root, text);
}

function openArtifact(id) {
  const root = document.getElementById("artifact-body");
  if (!root || !id) return;
  if (isDemoCatalog()) {
    openDemoArtifact(id);
    return;
  }
  fetch("/api/workspace?id=" + encodeURIComponent(id))
    .then((r) => r.json().then((body) => body))
    .then((body) => {
      if (body && body.exec) {
        show("policy", "refused: workspace must not grow a runtime");
        return;
      }
      const text =
        body && body.ok && body.artifact
          ? String(body.artifact.body || "")
          : (body && body.reason) || "live artifacts stay on the laptop";
      root.replaceChildren();
      paintOpenFileBody(root, body, text);
      const ok = Boolean(body && body.ok && body.artifact && String(body.artifact.body || "").trim());
      setWorkingSet(ok ? String(body.artifact.id || id) : "", ok ? String(body.artifact.title || body.artifact.id || id) : "");
      lastArtifactText = ok ? String(body.artifact.body) : "";
      lastArtifactFile = briefFileName((body && body.artifact && (body.artifact.desk || body.artifact.id)) || id);
      paintDeskChips("artifact-chips", (body && body.chips) || []);
      const filed = document.getElementById("artifact-filed");
      if (filed) {
        filed.hidden = true;
        filed.textContent = "";
      }
      const copyBtn = document.getElementById("artifact-copy");
      const dlBtn = document.getElementById("artifact-download");
      if (copyBtn) copyBtn.hidden = !ok;
      if (dlBtn) dlBtn.hidden = !ok;
      setFinishedDownloads(ok ? body.artifact : null, body);
    })
    .catch((err) => {
      root.replaceChildren();
      const pre = el("pre");
      pre.textContent = String(err);
      root.appendChild(pre);
      lastArtifactText = "";
      setWorkingSet("", "");
      paintDeskChips("artifact-chips", []);
      const copyBtn = document.getElementById("artifact-copy");
      const dlBtn = document.getElementById("artifact-download");
      if (copyBtn) copyBtn.hidden = true;
      if (dlBtn) dlBtn.hidden = true;
      setFinishedDownloads(null, { localFirst: true });
    });
}

function paintLanes(lanes) {
  const root = document.getElementById("lanes");
  if (!root) return;
  root.replaceChildren();
  ["pointer-act", "cursor-cloud", "cortex", "craft"].forEach((id) => {
    const held = lanes && lanes[id];
    const card = el("article", "desk");
    const h = el("h3");
    h.textContent = id;
    const p = el("p");
    p.textContent =
      held && held.owner
        ? "held by " + held.owner + (held.goal ? " - " + held.goal : "")
        : "free";
    const out = el("p", "muted");
    out.textContent = id === "pointer-act" ? "A second owner is refused." : "Lane is exclusive.";
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(out);
    root.appendChild(card);
  });
}

function paintList(id, rows, emptyText, line) {
  const root = document.getElementById(id);
  if (!root) return;
  root.replaceChildren();
  if (!rows || !rows.length) {
    const li = el("li", "muted");
    li.textContent = emptyText;
    root.appendChild(li);
    return;
  }
  rows.forEach((row) => {
    const li = el("li");
    li.textContent = line(row);
    root.appendChild(li);
  });
}

fetch("/api/state")
  .then((r) => r.json())
  .then((s) => {
    if (s && s.localFirst) {
      show(
        "state",
        (s.reason || "live lanes stay on the laptop") +
          "\nOpen " +
          (s.coordinator || "http://127.0.0.1:18010") +
          " while Pointer is running.\n\n" +
          JSON.stringify(s, null, 2)
      );
      return;
    }
    show("state", JSON.stringify(s, null, 2));
  })
  .catch((err) => show("state", String(err)));

function paintComputerDock(ws) {
  const dock = document.getElementById("computer-dock");
  if (!dock) return;
  dock.hidden = false;
  const status = document.getElementById("computer-status");
  if (status) {
    status.textContent =
      ws && ws.localFirst
        ? "Public catalog. Run is refused (P-06)."
        : String((ws && ws.reason) || "Live laptop workspace. Run is refused (P-06).");
  }
  wireComputerRun();
}

function wireComputerRun() {
  const btn = document.getElementById("computer-run");
  if (!btn || btn.dataset.wired === "1") return;
  btn.dataset.wired = "1";
  btn.addEventListener("click", function () {
    fetch("/api/workspace/exec", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "container", act: false }),
    })
      .then(function (r) {
        return r.json().then(function (body) {
          return { status: r.status, body: body };
        });
      })
      .then(function (out) {
        const reason = String(
          (out.body && (out.body.reason || out.body.error)) ||
            "workspace has no runtime; Act stays on the laptop (P-06)"
        );
        const refuse = document.getElementById("computer-refuse");
        if (refuse) {
          refuse.hidden = false;
          refuse.textContent = reason;
        }
        show("policy", reason);
      })
      .catch(function () {
        const refuse = document.getElementById("computer-refuse");
        if (refuse) {
          refuse.hidden = false;
          refuse.textContent = "workspace has no runtime; Act stays on the laptop (P-06)";
        }
      });
  });
}

const workspacePage = isWorkspacePage();
if (workspacePage) {
  pollWhileLive(function () {
    return Promise.all([
      fetch("/api/workspace").then((r) => r.json()),
      fetch("/api/state").then((r) => r.json()).catch(() => ({})),
    ]).then(([ws, state]) => {
      if (ws && ws.exec) {
        show("policy", "refused: public workspace must not grow a runtime");
        paintComputerDock({
          localFirst: true,
          reason: "refused: workspace must not grow a runtime",
        });
        return false;
      }
      if (paintDemoIfPublic(ws) || paintDemoIfPublic(state)) return false;
      show(
        "policy",
        (ws && ws.reason) || "workspace has no runtime; Act stays on the laptop"
      );
      paintComputerDock(ws);
      paintDesks((ws && ws.desks) || (state && state.desks) || []);
      paintArtifacts((ws && ws.artifacts) || []);
      paintSession(ws && ws.session, Boolean(ws && ws.localFirst));
      if (!openedQueryId) {
        openedQueryId = true;
        const qid = workspaceQueryId();
        if (qid && !(ws && ws.localFirst)) openArtifact(qid);
      }
      const coord = (ws && ws.coordinator) || (state && state.coordinator) || "http://127.0.0.1:18010";
      show(
        "hint",
        ws && ws.localFirst
          ? "This is the public catalog. Open " + coord + " while Pointer is running for live briefs."
          : "Live workspace on this machine. Exec stays refused."
      );
      return !(ws && ws.localFirst);
    });
  });
}

const artifactFilter = document.getElementById("artifact-filter");
if (artifactFilter) {
  artifactFilter.addEventListener("input", renderArtifactList);
}

const todayPage = document.getElementById("brief");
if (todayPage && pageDesk() === "today") {
  pollWhileLive(function () {
    return fetch("/api/today")
      .then((r) => r.json())
      .then(applyToday);
  });
}

function applyToday(t) {
  if (t && t.exec) {
    show("policy", "refused: today must not grow a runtime");
    return false;
  }
  if (paintDemoIfPublic(t)) return false;
  show("policy", (t && t.reason) || "standing brief; Act stays on the laptop");
  const plate = document.getElementById("today-cue-web");
  const plateText = String((t && t.cue) || "").trim();
  if (plate) {
    plate.hidden = !plateText;
    plate.textContent = plateText ? "Plate: " + plateText : "";
  }
  setCueButton(plateText, Boolean(t && t.localFirst));
  if (pageDesk() === "today") {
    const body = (t && (t.deliverable || t.brief)) || "";
    setBriefButtons(body, "today", Boolean(t && t.localFirst));
    paintEvents((t && (t.events || t.today)) || []);
  }
  paintTodayChips((t && t.chips) || []);
  const stage = document.getElementById("today-plate");
  if (stage) {
    stage.replaceChildren();
    paintTodayPlate(stage, t);
    stage.hidden = !stage.childNodes.length;
  }
  return !(t && t.localFirst);
}

function paintDeskChips(rootId, chips) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.replaceChildren();
  (chips || []).forEach(function (c) {
    const q = String(c.q || "").trim();
    if (!q) return;
    const b = el("button");
    b.type = "button";
    b.textContent = String(c.label || q).slice(0, 48);
    b.addEventListener("click", function () { postAsk(q); });
    root.appendChild(b);
  });
}

function paintTodayChips(chips) {
  paintDeskChips("today-chips", chips);
}

function pageDesk() {
  const p = String((typeof location !== "undefined" && location.pathname) || "/").replace(/\/+$/, "") || "/";
  if (p === "/today") return "today";
  if (p === "/meeting") return "meeting";
  if (p === "/teach") return "teach";
  if (p === "/security") return "security";
  if (p === "/document") return "document";
  if (p === "/inbox") return "inbox";
  return "";
}

function showFiled(line) {
  const text = String(line || "");
  ["host-filed", "today-filed", "artifact-filed", "meeting-filed"].forEach(function (id) {
    const filed = document.getElementById(id);
    if (!filed) return;
    filed.hidden = !text;
    filed.textContent = text;
  });
}

function demoAskDesk(ask) {
  const t = String(ask || "").toLowerCase();
  if (!t) return "";
  if (/\b(got it|next control|i clicked|walk me through|teach me|on (my )?screen|back)\b/.test(t)) {
    return "teach";
  }
  if (/\b(security review|vuln|cve)\b/.test(t)) return "security";
  if (/\b(?:microsoft\s+)?word\b/.test(t) || /\bdocx\b/.test(t)) return "document";
  if (/\b(inbox|gmail|outlook|slack reply|email|follow-?up)\b/.test(t)) return "inbox";
  if (
    (/\b(meeting|standup|what should i say|next steps?|action items?)\b/.test(t) || /\brecap\b/.test(t)) &&
    !/\b(inbox|gmail|outlook|email|word|docx)\b/.test(t)
  ) {
    return "meeting";
  }
  if (/\b(on my plate|today'?s brief|morning brief)\b/.test(t)) return "today";
  return "";
}

function demoAskChips() {
  return [
    { q: "got it, next", label: "Got it" },
    { q: "draft a follow-up email from this meeting", label: "Draft email" },
    { q: "write this recap in Word", label: "Notes" },
    { q: "Security review this session", label: "Needs you" },
    { q: "what should I say", label: "Live answer" },
  ];
}

function revealHomeWindow(id) {
  const map = {
    "live-inbox": ".desk-inbox",
    "live-document": ".desk-document",
    "live-security": ".desk-security",
    "live-meeting": ".meeting-card",
    "standing-today": ".today-plate",
  };
  const sel = map[String(id || "")];
  const root = document.getElementById("stage");
  if (!sel || !root) return false;
  const node = root.querySelector(sel);
  if (!node) return false;
  root.querySelectorAll(".desk-window-now").forEach(function (el) {
    el.classList.remove("desk-window-now");
  });
  node.classList.add("desk-window-now");
  if (typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
  return true;
}

function demoHighlightWalk() {
  if (isWorkspacePage() && document.getElementById("artifact-body")) {
    if (workspaceQueryId()) return;
    if (demoInboxSaved()) {
      showFiled("Saved on This computer. Opened Live answer. Never sent.");
      openDemoArtifact("live-meeting");
    }
    return;
  }
  if (!document.getElementById("stage")) return;
  if (demoInboxSaved()) {
    showFiled("Saved on This computer. Opened Live answer. Never sent.");
    revealHomeWindow("live-meeting");
    return;
  }
  const filed = document.getElementById("host-filed");
  if (filed && /Opened Live answer\. Never sent/.test(String(filed.textContent || ""))) showFiled("");
  revealHomeWindow("live-inbox");
}

function demoAsk(ask) {
  const desk = demoAskDesk(ask);
  if (desk === "teach") {
    postTeach(ask);
    return;
  }
  const ids = {
    inbox: "live-inbox",
    document: "live-document",
    security: "live-security",
    meeting: "live-meeting",
    today: "standing-today",
  };
  const id = ids[desk];
  if (!id) {
    showFiled("Demo catalog. Ask stays on the laptop. Never Act.");
    return;
  }
  if (desk === "inbox") showFiled("Demo catalog. Opened unsent mail. Never sent. Never Act.");
  else if (desk === "document") showFiled("Demo catalog. Opened Notes. Never a .docx. Never Act.");
  else if (desk === "security") showFiled("Demo catalog. Opened Needs you. Never approval. Never Act.");
  else if (desk === "meeting") showFiled("Demo catalog. Opened Live answer. Never a cheater overlay. Never Act.");
  else showFiled("Demo catalog. Opened Today. Never Act.");
  if (isWorkspacePage()) {
    openDemoArtifact(id);
    return;
  }
  if (revealHomeWindow(id)) return;
}

function postAsk(ask) {
  if (isDemoCatalog()) {
    demoAsk(ask);
    return;
  }
  const payload = { ask: ask, act: false };
  if (lastOpenId) payload.id = lastOpenId;
  fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((r) => r.json())
    .then(function (out) {
      const filedIds = ["host-filed", "today-filed", "artifact-filed", "meeting-filed"];
      const ok = Boolean(out && out.ok);
      let line = "";
      if (ok) {
        const here = pageDesk();
        line =
          out.desk === here
            ? "Updated " + (out.desk || "desk") + (out.cue ? " - " + out.cue : "") + ". Never Act."
            : "Filed " +
              (out.title || out.desk) +
              " (" +
              (out.href || "") +
              ")" +
              (out.cue ? " - " + out.cue : "") +
              ". Never sent. Never a .docx. Never Act.";
      } else if (out && out.reason) {
        line = String(out.reason);
      }
      filedIds.forEach(function (id) {
        const filed = document.getElementById(id);
        if (!filed) return;
        filed.hidden = !line;
        filed.textContent = line;
      });
      if (out && out.ok && out.desk === "meeting" && typeof meetingApply === "function") {
        fetch("/api/meeting")
          .then((r) => r.json())
          .then(meetingApply)
          .catch(function () {});
      }
      if (out && out.ok && out.desk === "teach" && typeof teachApply === "function") {
        fetch("/api/teach")
          .then((r) => r.json())
          .then(teachApply)
          .catch(function () {});
      }
      if (document.getElementById("brief")) {
        fetch("/api/today")
          .then((r) => r.json())
          .then(applyToday)
          .catch(function () {});
      }
      fetch("/api/home")
        .then((r) => r.json())
        .then(function (h) {
          paintChrome(h);
          if (document.getElementById("rooms")) {
            paintRooms((h && h.rooms) || {}, Boolean(h && h.localFirst));
            paintStage((h && h.rooms) || {}, Boolean(h && h.localFirst));
            paintSession(h && h.session, Boolean(h && h.localFirst));
          }
        })
        .catch(function () {});
    })
    .catch(function () {});
}

function paintMeetingCard(root, m) {
  if (!root || !m || m.desk !== "meeting" || m.localFirst) return;
  const asked = String(m.asked || "").trim();
  const cue = String(m.cue || "").trim();
  const heard = String(m.heard || "").trim();
  const caps = Array.isArray(m.captions) ? m.captions : [];
  const themLine = lastTalkLine(m.turns, "them");
  const youLine = lastTalkLine(m.turns, "you");
  const themShow = Boolean(themLine && themLine !== asked);
  const youShow = Boolean(youLine);
  if (!asked && !cue && !heard && !caps.length && !themShow && !youShow) return;
  const card = el("section", "meeting-card");
  card.setAttribute("role", "region");
  card.setAttribute("aria-label", asked ? "They asked: " + asked : "Live meeting answer");
  const kicker = el("p", "meeting-card-kicker");
  kicker.textContent = "Live answer";
  card.appendChild(kicker);
  if (asked) {
    const q = el("p", "meeting-card-asked");
    q.textContent = "They asked: " + asked;
    card.appendChild(q);
  }
  if (themShow) {
    const them = el("p", "meeting-card-them");
    them.textContent = "Them: " + themLine;
    card.appendChild(them);
  }
  if (youShow) {
    const you = el("p", "meeting-card-you");
    you.textContent = "You: " + youLine;
    card.appendChild(you);
  }
  if (caps.length) {
    const wrap = el("div", "meeting-card-captions");
    caps.forEach(function (row) {
      const text = String((row && row.text) || "").trim();
      if (!text) return;
      const p = el("p", "meeting-card-caption");
      p.textContent = "Live: " + text.slice(0, 160);
      wrap.appendChild(p);
    });
    if (wrap.childNodes.length) card.appendChild(wrap);
  }
  if (cue) {
    const say = el("p", "meeting-card-say");
    say.textContent = cue;
    card.appendChild(say);
  }
  const also = String(m.also || "").trim();
  if (also) {
    const extra = el("p", "meeting-card-also");
    extra.textContent = "Also: " + also;
    card.appendChild(extra);
  }
  const avoid = String(m.avoid || "").trim();
  if (avoid) {
    const no = el("p", "meeting-card-avoid");
    no.textContent = "Don't say: " + avoid + (/never a cheater overlay/i.test(avoid) ? "" : " Never a cheater overlay.");
    card.appendChild(no);
  }
  if (heard) {
    const facts = el("p", "meeting-card-heard");
    facts.textContent = "Heard: " + heard;
    card.appendChild(facts);
  }
  if (m.notes) {
    const from = el("p", "meeting-card-from");
    from.textContent = "From the open file";
    card.appendChild(from);
  }
  root.appendChild(card);
}

function paintTalk(root, m) {
  if (!root || !m || m.desk !== "meeting") return;
  const rows = Array.isArray(m.turns) ? m.turns : [];
  if (!rows.length || m.localFirst) return;
  const asked = String(m.asked || "").trim();
  const ol = el("ol", "meeting-talk");
  rows.forEach(function (row) {
    const text = String((row && row.text) || "").trim();
    if (!text) return;
    const you = row.speaker === "you";
    const now = Boolean(row.asked) && asked && text === asked;
    const li = el("li", "talk-" + (you ? "you" : "them") + (now ? " talk-now" : ""));
    const who = el("span", "talk-who");
    who.textContent = you ? "You:" : "Them:";
    const body = el("span", "talk-text");
    body.textContent = text;
    li.appendChild(who);
    li.appendChild(body);
    ol.appendChild(li);
  });
  if (ol.childNodes.length) root.appendChild(ol);
}

function applyLiveRoom(page, pageId, cueId, askedId, refuse, m) {
  if (m && m.exec) {
    show("policy", refuse || "refused: coworker room must not grow a runtime");
    return false;
  }
  if (paintDemoIfPublic(m)) return false;
  show("policy", (m && m.reason) || "live coworker; Act stays on the laptop");
  const cue = cueId ? document.getElementById(cueId) : null;
  const text = String((m && m.cue) || "").trim();
  if (cue) {
    const prefix =
      (m && m.desk) === "teach"
        ? ""
        : (m && m.desk) === "meeting"
          ? "Say this: "
          : (m && m.desk) === "today"
            ? "Plate: "
            : (m && m.desk) === "document" || (m && m.desk) === "inbox"
              ? ""
              : "Review: ";
    const line = (m && m.desk) === "teach" ? teachActionLine(m) || text : text;
    cue.hidden = !line;
    cue.textContent = line ? prefix + line : "";
  }
  setCueButton((m && m.desk) === "teach" ? teachActionLine(m) || text : text, Boolean(m && m.localFirst));
  const askedEl = askedId ? document.getElementById(askedId) : null;
  const asked = String((m && m.asked) || "").trim();
  if (askedEl) {
    askedEl.hidden = !asked;
    askedEl.textContent = asked ? "They asked: " + asked : "";
  }
  const heardEl = document.getElementById(pageId.replace("-brief", "-heard-web"));
  const heard = String((m && m.heard) || "").trim();
  if (heardEl) {
    heardEl.hidden = !heard;
    heardEl.textContent = heard ? "Heard: " + heard : "";
  }
  const restEl = document.getElementById(pageId.replace("-brief", "-rest-web"));
  const rest = String((m && m.rest) || "").trim();
  if (restEl) {
    const line = rest ? "Then: " + rest : String((m && (m.action || m.cue)) || "").trim() ? "Last step" : "";
    restEl.hidden = !line;
    restEl.textContent = line;
  }
  setTeachButtons(m);
  paintDeskChips(pageId.replace("-brief", "-chips"), (m && m.chips) || []);
  page.replaceChildren();
  paintTeachMap(page, m, pageId === "teach-brief" ? { draw: true, apply: function (next) { applyLiveRoom(page, pageId, cueId, askedId, refuse, next); } } : undefined);
  paintMeetingCard(page, m);
  paintTalk(page, m);
  const desk = String((m && m.desk) || "").toLowerCase();
  const body = String((m && m.deliverable) || "");
  const art = {
    title: (m && m.artifact && m.artifact.title) || "",
    cue: (m && m.cue) || "",
    preview: (m && m.preview) || "",
    findings: (m && m.findings) || [],
  };
  if (desk === "document") {
    applyOpenDocument(page, art, body);
  } else if (desk === "inbox") {
    applyOpenInbox(page, art, body);
  } else if (desk === "security") {
    applyOpenSecurity(page, art, body);
  } else if (desk === "today") {
    paintTodayPlate(page, m);
  }
  setBriefButtons(body, (m && m.desk) || "brief", Boolean(m && m.localFirst));
  setFinishedDownloads(m, m);
  return !(m && m.localFirst);
}

function paintLiveRoom(pageId, apiPath, cueId, refuse, askedId) {
  const page = document.getElementById(pageId);
  if (!page) return;
  function apply(m) {
    return applyLiveRoom(page, pageId, cueId, askedId, refuse, m);
  }
  pollWhileLive(function () {
    return fetch(apiPath)
      .then((r) => r.json())
      .then(apply);
  });
  if (pageId === "teach-brief") wireTeachAdvance(apply);
  if (pageId === "teach-brief") teachApply = apply;
  if (pageId === "meeting-brief") meetingApply = apply;
}

let meetingApply = null;
let teachApply = null;

function paintMeetingChips(chips) {
  paintDeskChips("meeting-chips", chips);
}

function postMeeting(ask) {
  if (isDemoCatalog()) {
    postAsk(ask);
    return;
  }
  fetch("/api/meeting", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ask: ask, act: false }),
  })
    .then((r) => r.json())
    .then(function (out) {
      const filed = document.getElementById("meeting-filed");
      const other = Boolean(out && out.ok && out.desk && out.desk !== "meeting");
      if (filed) {
        filed.hidden = !other;
        filed.textContent = other
          ? "Filed " + (out.title || out.desk) + " (" + (out.href || "") + ") - " + (out.cue || "") + ". Never sent. Never a .docx."
          : "";
      }
      if (out && out.ok && out.desk === "meeting" && typeof meetingApply === "function") meetingApply(out);
      else if (typeof meetingApply === "function") {
        fetch("/api/meeting")
          .then((r) => r.json())
          .then(meetingApply)
          .catch(function () {});
      }
      fetch("/api/home")
        .then((r) => r.json())
        .then(paintChrome)
        .catch(function () {});
    })
    .catch(function () {});
}

function postTeach(ask, apply) {
  if (isDemoCatalog()) {
    demoAdvanceTeach(ask);
    const m = demoTeachRoom();
    if (typeof apply === "function") apply(m);
    applyDemoCatalog();
    return;
  }
  fetch("/api/teach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ask: ask, act: false }),
  })
    .then((r) => r.json())
    .then(function (m) {
      if (typeof apply === "function") apply(m);
      fetch("/api/home")
        .then((r) => r.json())
        .then(paintChrome)
        .catch(function () {});
    })
    .catch(function () {});
}

function setTeachButtons(m) {
  const on = Boolean(m && m.advance && !m.localFirst && !m.exec && m.ok !== false);
  const back = document.getElementById("teach-back");
  const next = document.getElementById("teach-next");
  if (back) back.hidden = !on;
  if (next) next.hidden = !on;
}

function wireTeachAdvance(apply) {
  const next = document.getElementById("teach-next");
  const back = document.getElementById("teach-back");
  if (next && !next.dataset.wired) {
    next.dataset.wired = "1";
    next.addEventListener("click", function () { postTeach("got it, next", apply); });
  }
  if (back && !back.dataset.wired) {
    back.dataset.wired = "1";
    back.addEventListener("click", function () { postTeach("back", apply); });
  }
}

let lastChromeCue = "";

function chromeBtn(id, label) {
  const b = el("button");
  b.id = id;
  b.type = "button";
  b.textContent = label;
  b.hidden = true;
  return b;
}

function lastTalkLine(turns, speaker) {
  const want = speaker === "you" ? "you" : "them";
  const rows = Array.isArray(turns) ? turns : [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row || (row.speaker === "you" ? "you" : "them") !== want) continue;
    const text = String((row && row.text) || "").trim();
    if (text) return text.slice(0, 160);
  }
  return "";
}

function meetingCopyText(m) {
  const asked = String((m && m.asked) || "").trim();
  const cue = String((m && m.cue) || "").trim();
  const also = String((m && m.also) || "").trim();
  const avoid = String((m && m.avoid) || "").trim();
  const heard = String((m && m.heard) || "").trim();
  const you = lastTalkLine(m && m.turns, "you");
  const lines = ["Live answer"];
  if (asked) lines.push("They asked: " + asked);
  if (you) lines.push("You: " + you);
  if (cue) lines.push("Say this: " + cue);
  if (also) lines.push("Also: " + also);
  if (heard) lines.push("Heard: " + heard);
  if (avoid) {
    lines.push("Don't say: " + avoid + (/never a cheater overlay/i.test(avoid) ? "" : " Never a cheater overlay."));
  } else {
    lines.push("Never a cheater overlay.");
  }
  return lines.filter(Boolean).join("\n");
}

function ensureLiveCueBar() {
  let bar = document.getElementById("live-cue-bar");
  if (bar) return bar;
  bar = el("div", "live-cue-bar");
  bar.id = "live-cue-bar";
  bar.hidden = true;
  const asked = el("p", "live-cue-asked");
  asked.id = "live-cue-asked";
  asked.hidden = true;
  const heard = el("p", "live-cue-heard");
  heard.id = "live-cue-heard";
  heard.hidden = true;
  const text = el("p", "live-cue-text");
  text.id = "live-cue-text";
  const actions = el("div", "live-cue-actions");
  const back = chromeBtn("live-cue-back", "Back");
  const next = chromeBtn("live-cue-next", "Got it");
  const copy = chromeBtn("live-cue-copy", "Copy");
  actions.appendChild(back);
  actions.appendChild(next);
  actions.appendChild(copy);
  bar.appendChild(asked);
  bar.appendChild(heard);
  const them = el("p", "live-cue-heard");
  them.id = "live-cue-them";
  them.hidden = true;
  const you = el("p", "live-cue-heard");
  you.id = "live-cue-you";
  you.hidden = true;
  bar.appendChild(them);
  bar.appendChild(you);
  const caps = el("div", "live-cue-captions");
  caps.id = "live-cue-captions";
  caps.hidden = true;
  bar.appendChild(caps);
  const also = el("p", "live-cue-heard");
  also.id = "live-cue-also";
  also.hidden = true;
  const avoid = el("p", "live-cue-heard");
  avoid.id = "live-cue-avoid";
  avoid.hidden = true;
  bar.appendChild(also);
  bar.appendChild(avoid);
  bar.appendChild(text);
  bar.appendChild(actions);
  const openChip = el("p", "live-cue-open");
  openChip.id = "host-open";
  openChip.hidden = true;
  bar.appendChild(openChip);
  const chips = el("p", "desk-chips");
  chips.id = "host-ask-chips";
  bar.appendChild(chips);
  const form = el("form", "live-cue-ask");
  form.id = "host-ask-form";
  const input = document.createElement("input");
  input.id = "host-ask";
  input.type = "text";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Ask the coworker");
  input.placeholder = "Ask the coworker (never Act)";
  const go = el("button");
  go.id = "host-ask-go";
  go.type = "submit";
  go.textContent = "Ask";
  form.appendChild(input);
  form.appendChild(go);
  const filed = el("p", "muted");
  filed.id = "host-filed";
  filed.hidden = true;
  bar.appendChild(form);
  bar.appendChild(filed);
  const header = document.querySelector("header");
  if (header && header.parentNode) header.parentNode.insertBefore(bar, header.nextSibling);
  else document.body.insertBefore(bar, document.body.firstChild);
  back.addEventListener("click", function () { postTeach("back"); });
  next.addEventListener("click", function () { postTeach("got it, next"); });
  copy.addEventListener("click", function () { copyPlain(lastChromeCue); });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    const q = String(input.value || "").trim();
    if (!q) return;
    postAsk(q);
  });
  return bar;
}

function paintChrome(home) {
  const bar = ensureLiveCueBar();
  if (!bar) return;
  if (!home || home.localFirst || home.exec) {
    bar.hidden = true;
    lastChromeCue = "";
    return;
  }
  const s = home.session || {};
  const rooms = home.rooms || {};
  const teach = rooms.teach || {};
  const meeting = rooms.meeting || {};
  const asked = String(s.asked || meeting.asked || "").trim();
  const heard = String(s.heard || meeting.heard || "").trim();
  const meetingCue = String(meeting.cue || s.cue || "").trim();
  const teachCue = String(teach.cue || "").trim();
  const teachAction = String(teach.action || "").trim() || String(teachCue).replace(/^\d+\s+of\s+\d+\s+/i, "").trim();
  const teachRest = String(teach.rest || "").trim();
  const plate = String(s.plate || "").trim();
  const onTeach = Boolean(document.getElementById("teach-brief"));
  const onMeeting = Boolean(document.getElementById("meeting-brief"));
  const onHome = Boolean(document.getElementById("stage"));
  const showMeeting = !onTeach && (onMeeting || onHome);
  let cueLine = "";
  if (onTeach && teachAction) cueLine = teachAction;
  else if (showMeeting && asked && meetingCue) cueLine = "Say this: " + meetingCue;
  else if (onTeach) cueLine = teachAction || String(teachCue).replace(/^\d+\s+of\s+\d+\s+/i, "").trim();
  else if (showMeeting && meetingCue) cueLine = "Say this: " + meetingCue;
  else if (plate) cueLine = "Plate: " + plate;
  else if (meetingCue) cueLine = "Say this: " + meetingCue;
  const askedEl = document.getElementById("live-cue-asked");
  const heardEl = document.getElementById("live-cue-heard");
  const textEl = document.getElementById("live-cue-text");
  if (askedEl) {
    askedEl.hidden = onTeach || !asked;
    askedEl.textContent = !onTeach && asked ? "They asked: " + asked : "";
  }
  if (heardEl) {
    if (onTeach) {
      const thenLine = teachRest ? "Then: " + teachRest : cueLine ? "Last step" : "";
      heardEl.hidden = !thenLine;
      heardEl.textContent = thenLine;
    } else {
      heardEl.hidden = !heard;
      heardEl.textContent = heard ? "Heard: " + heard : "";
    }
  }
  const themEl = document.getElementById("live-cue-them");
  const youEl = document.getElementById("live-cue-you");
  const themLine = showMeeting ? lastTalkLine(meeting.turns, "them") : "";
  const youLine = showMeeting ? lastTalkLine(meeting.turns, "you") : "";
  const themShow = Boolean(themLine && themLine !== asked);
  const youShow = Boolean(youLine);
  if (themEl) {
    themEl.hidden = !themShow;
    themEl.textContent = themShow ? "Them: " + themLine : "";
  }
  if (youEl) {
    youEl.hidden = !youShow;
    youEl.textContent = youShow ? "You: " + youLine : "";
  }
  const alsoEl = document.getElementById("live-cue-also");
  const avoidEl = document.getElementById("live-cue-avoid");
  const also = showMeeting ? String(meeting.also || "").trim() : "";
  const avoid = showMeeting ? String(meeting.avoid || "").trim() : "";
  if (alsoEl) {
    alsoEl.hidden = !also;
    alsoEl.textContent = also ? "Also: " + also : "";
  }
  if (avoidEl) {
    avoidEl.hidden = !avoid;
    avoidEl.textContent = avoid ? "Don't say: " + avoid : "";
  }
  const cap = document.getElementById("live-cue-captions");
  const capRows = showMeeting && Array.isArray(meeting.captions) ? meeting.captions : [];
  if (cap) {
    cap.replaceChildren();
    capRows.forEach(function (row) {
      const text = String((row && row.text) || "").trim();
      if (!text) return;
      const p = el("p", "live-cue-caption");
      p.textContent = "Live: " + text;
      cap.appendChild(p);
    });
    cap.hidden = !cap.childNodes.length;
  }
  if (textEl) textEl.textContent = cueLine;
  lastChromeCue = onTeach
    ? teachAction || teachCue
    : showMeeting
      ? meetingCopyText(meeting)
      : meetingCue || plate;
  if (onTeach) speakTeachCue(teachRest ? teachAction || teachCue : teachAction || teachCue ? (teachAction || teachCue) + ". Last step" : "");
  bar.hidden = false;
  const canWalk = onTeach && Boolean(teach.advance);
  const demoWalkOn = isDemoCatalog() && (onHome || isWorkspacePage());
  const canBack = Boolean(canWalk || (demoWalkOn && (demoTeachStep > 0 || demoInboxSaved())));
  const canNext = Boolean(canWalk || (demoWalkOn && !demoInboxSaved()));
  const back = document.getElementById("live-cue-back");
  const next = document.getElementById("live-cue-next");
  const copy = document.getElementById("live-cue-copy");
  if (back) back.hidden = !canBack;
  if (next) next.hidden = !canNext;
  if (copy) copy.hidden = !lastChromeCue;
  paintDeskChips(
    "host-ask-chips",
    home && Array.isArray(home.chips) && home.chips.length
      ? home.chips
      : isDemoCatalog()
        ? demoAskChips()
        : []
  );
  paintWorkingSet();
}

paintLiveRoom("meeting-brief", "/api/meeting", "meeting-cue-web", "refused: meeting must not grow a runtime", "meeting-asked-web");
paintLiveRoom("teach-brief", "/api/teach", "teach-cue-web", "refused: teach must not grow a runtime");
paintLiveRoom("security-brief", "/api/security", "security-cue-web", "refused: security must not grow a runtime");
paintLiveRoom("document-brief", "/api/document", "document-cue-web", "refused: document must not grow a runtime");
paintLiveRoom("inbox-brief", "/api/inbox", "inbox-cue-web", "refused: inbox must not grow a runtime");

function hitTeachBox(box, xPct, yPct) {
  if (!box) return false;
  const x = Number(xPct);
  const y = Number(yPct);
  const left = Number(box.leftPct);
  const top = Number(box.topPct);
  const w = Number(box.wPct);
  const h = Number(box.hPct);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(left) || !Number.isFinite(top) || !(w > 0) || !(h > 0)) {
    return false;
  }
  return x >= left && x <= left + w && y >= top && y <= top + h;
}

function postTeachFrame(box, apply) {
  if (isDemoCatalog()) {
    const ok = demoFrameTeach(box);
    const filed = document.getElementById("host-filed");
    if (filed) {
      filed.hidden = false;
      filed.textContent = ok
        ? "Demo catalog. Drew a BOX. Never Act."
        : demoTeachWalk().length >= 8
          ? "Demo catalog. Walk is full - 8 boxes. Never Act."
          : "Demo catalog. Draw a larger BOX (0.4%). Never Act.";
    }
    if (ok) {
      const m = demoTeachRoom();
      if (typeof apply === "function") apply(m);
      applyDemoCatalog();
    }
    return;
  }
  fetch("/api/teach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ region: box, act: false }),
  })
    .then((r) => r.json())
    .then(function (m) {
      if (!m || !m.ok || m.act || m.exec) return;
      if (typeof apply === "function") apply(m);
      fetch("/api/home")
        .then((r) => r.json())
        .then(paintChrome)
        .catch(function () {});
    })
    .catch(function () {});
}

function wireTeachFrame(map, apply, current) {
  if (!map || map.dataset.framed === "1") return;
  map.dataset.framed = "1";
  let drag = null;
  let ghost = null;
  let strokeSvg = null;
  let strokeLine = null;
  function pctFromEvent(ev) {
    const r = map.getBoundingClientRect();
    const w = r.width || 1;
    const h = r.height || 1;
    return {
      x: Math.max(0, Math.min(100, ((ev.clientX - r.left) / w) * 100)),
      y: Math.max(0, Math.min(100, ((ev.clientY - r.top) / h) * 100)),
    };
  }
  function pushStroke(pts, p) {
    const last = pts[pts.length - 1];
    if (!last) {
      pts.push(p);
      return;
    }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy < 0.12) return;
    if (pts.length >= 80) pts[pts.length - 1] = p;
    else pts.push(p);
  }
  function ensureStroke() {
    if (strokeSvg) return;
    strokeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    strokeSvg.setAttribute("class", "teach-map-stroke");
    strokeSvg.setAttribute("viewBox", "0 0 100 100");
    strokeSvg.setAttribute("preserveAspectRatio", "none");
    strokeLine = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    strokeSvg.appendChild(strokeLine);
    map.appendChild(strokeSvg);
  }
  function paintGhost() {
    if (!drag || !ghost) return;
    const pts = drag.stroke || [];
    let x0 = drag.x0;
    let y0 = drag.y0;
    let x1 = drag.x1;
    let y1 = drag.y1;
    for (let i = 0; i < pts.length; i++) {
      x0 = Math.min(x0, pts[i].x);
      y0 = Math.min(y0, pts[i].y);
      x1 = Math.max(x1, pts[i].x);
      y1 = Math.max(y1, pts[i].y);
    }
    ghost.style.left = x0 + "%";
    ghost.style.top = y0 + "%";
    ghost.style.width = Math.abs(x1 - x0) + "%";
    ghost.style.height = Math.abs(y1 - y0) + "%";
    ghost.hidden = false;
    if (strokeLine && pts.length >= 2) {
      let points = "";
      for (let i = 0; i < pts.length; i++) {
        points += (i ? " " : "") + pts[i].x + "," + pts[i].y;
      }
      strokeLine.setAttribute("points", points);
      strokeSvg.hidden = false;
    }
  }
  map.addEventListener("pointerdown", function (ev) {
    if (ev.button != null && ev.button !== 0) return;
    if (ev.target && ev.target.closest && ev.target.closest("[data-rail]")) return;
    const p = pctFromEvent(ev);
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, stroke: [p] };
    if (!ghost) {
      ghost = el("div", "teach-map-box drag");
      map.appendChild(ghost);
    }
    ensureStroke();
    paintGhost();
    if (map.setPointerCapture) map.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  map.addEventListener("pointermove", function (ev) {
    if (!drag) return;
    const p = pctFromEvent(ev);
    drag.x1 = p.x;
    drag.y1 = p.y;
    pushStroke(drag.stroke, p);
    paintGhost();
  });
  function endDrag() {
    if (!drag) return;
    const stroke = drag.stroke ? drag.stroke.slice() : [];
    const box = { x0: drag.x0, y0: drag.y0, x1: drag.x1, y1: drag.y1, stroke: stroke };
    drag = null;
    if (ghost) ghost.hidden = true;
    if (strokeSvg) strokeSvg.hidden = true;
    const tap =
      stroke.length < 2 ||
      (Math.abs(box.x1 - box.x0) < 1.5 && Math.abs(box.y1 - box.y0) < 1.5);
    if (tap) {
      if (hitTeachBox(current, box.x1, box.y1) || hitTeachBox(current, box.x0, box.y0)) {
        postTeach("i clicked", apply);
      }
      return;
    }
    postTeachFrame(box, apply);
  }
  map.addEventListener("pointerup", endDrag);
  map.addEventListener("pointercancel", function () {
    drag = null;
    if (ghost) ghost.hidden = true;
    if (strokeSvg) strokeSvg.hidden = true;
  });
}

function wireTeachTap(map, apply, current) {
  if (!map || map.dataset.tapped === "1") return;
  map.dataset.tapped = "1";
  map.addEventListener("click", function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest("[data-rail]")) return;
    const r = map.getBoundingClientRect();
    const w = r.width || 1;
    const h = r.height || 1;
    const x = ((ev.clientX - r.left) / w) * 100;
    const y = ((ev.clientY - r.top) / h) * 100;
    if (!hitTeachBox(current, x, y)) return;
    postTeach("i clicked", apply);
    ev.preventDefault();
  });
}

function teachActionLine(m) {
  const action = String((m && m.action) || "").trim();
  if (action) return action;
  return String((m && m.cue) || "")
    .replace(/^\d+\s+of\s+\d+\s+/i, "")
    .trim();
}

function teachControlFace(p) {
  const cue = String((p && (p.cue || p.label)) || "").toLowerCase();
  if (/\btype in\b|\bedit\b|\bemail\b|\bfield\b|\binput\b/.test(cue)) return "field";
  if (/\bclick\b|\bsave\b|\bcancel\b|\bbutton\b|\bsubmit\b/.test(cue)) return "button";
  return "region";
}

function teachControlCaption(p) {
  return String((p && (p.label || p.cue)) || "control")
    .replace(/^\d+\s+of\s+\d+\s+/i, "")
    .replace(/^\d+\s+/, "")
    .replace(/^(type in|click|look at)\s+/i, "")
    .replace(/\s+then\s+tab$/i, "")
    .trim()
    .slice(0, 24) || "control";
}

function paintTeachInk(map, boxes) {
  if (!map) return;
  const inked = (boxes || []).filter(function (p) {
    return p && Array.isArray(p.stroke) && p.stroke.length >= 2;
  });
  if (!inked.length) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "teach-map-ink");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  inked.forEach(function (p) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute(
      "points",
      p.stroke
        .map(function (pt) {
          return Number(pt.x) + " " + Number(pt.y);
        })
        .join(" ")
    );
    line.setAttribute("class", p.now ? "now" : p.later ? "then" : "done");
    svg.appendChild(line);
  });
  map.appendChild(svg);
}

function onTeachRailStep(i, path, apply) {
  const want = Number(i);
  if (!Number.isInteger(want) || want < 0) return;
  let now = 0;
  (path || []).forEach(function (p, idx) {
    if (p && p.now) now = idx;
    else if (p && !p.later && !p.done) now = idx;
  });
  if (want === now && !(isDemoCatalog() && demoInboxSaved())) return;
  if (isDemoCatalog()) {
    const last = demoTeachWalk().length - 1;
    if (want === demoTeachStep && !demoInboxSaved()) return;
    demoTeachStep = Math.max(0, Math.min(want, last));
    const m = demoTeachRoom();
    if (typeof apply === "function") apply(m);
    applyDemoCatalog();
    return;
  }
  postTeach(want < now ? "back" : "got it, next", apply);
}

function paintTeachMap(root, m, opts) {
  if (!root || (m && m.desk && m.desk !== "teach") || (m && m.localFirst)) return;
  const draw = Boolean(opts && opts.draw) && !(m && m.localFirst) && !(m && m.exec);
  const tap = !draw && Boolean(opts && opts.tap) && !(m && m.localFirst) && !(m && m.exec);
  const path = Array.isArray(m && m.path) && m.path.length ? m.path : [];
  const markers = Array.isArray(m && m.markers) ? m.markers : [];
  const boxes = path.length
    ? path.filter((p) => Number(p.wPct) > 0 && Number(p.hPct) > 0)
    : markers.filter((p) => Number(p.wPct) > 0 && Number(p.hPct) > 0);
  const dots = path.length
    ? path.filter((p) => p.now && Number.isFinite(Number(p.xPct)) && Number.isFinite(Number(p.yPct)))
    : markers.filter((p) => Number.isFinite(Number(p.xPct)) && Number.isFinite(Number(p.yPct)));
  if (!boxes.length && !dots.length && !draw) return;
  const map = el("div", draw ? "teach-map draw" : tap ? "teach-map tap" : "teach-map");
  map.setAttribute("role", draw ? "application" : "img");
  const action = teachActionLine(m);
  const rest = String((m && m.rest) || "").trim();
  map.setAttribute("aria-label", action ? action : draw ? "Draw around a control on this stage. Never Act." : "Teach walk");
  const screen = el("p", "teach-map-screen");
  screen.textContent = "This screen";
  map.appendChild(screen);
  if (draw) {
    const hint = el("p", boxes.length ? "teach-map-hint add" : "teach-map-hint");
    hint.textContent = boxes.length
      ? "Click the current BOX to Got it. Draw another BOX to add a step."
      : "Draw around a control. Pointer stores a BOX and will not click.";
    map.appendChild(hint);
  } else if (tap) {
    const hint = el("p", "teach-map-hint");
    hint.textContent = "Click the current BOX to Got it. Never Act.";
    map.appendChild(hint);
  }
  if (action) {
    const next = el("p", "teach-map-cue");
    next.textContent = action;
    map.appendChild(next);
  }
  if (rest) {
    const then = el("p", "teach-map-then");
    then.textContent = "Then: " + rest;
    map.appendChild(then);
  } else if (action && !/^saved on this computer/i.test(action)) {
    const then = el("p", "teach-map-then");
    then.textContent = "Last step";
    map.appendChild(then);
  }
  boxes.forEach((p) => {
    const face = teachControlFace(p);
    if (p.done && face === "field") return;
    const control = el("div", "teach-map-control " + face);
    control.style.left = Number(p.leftPct) + "%";
    control.style.top = Number(p.topPct) + "%";
    control.style.width = Number(p.wPct) + "%";
    control.style.height = Number(p.hPct) + "%";
    const faceLab = el("span", "teach-map-face");
    faceLab.textContent =
      p.done && face === "button" && /save/i.test(String((p.caption || p.label || p.cue) || ""))
        ? "Saved"
        : p.now && p.fill
        ? String(p.fill).slice(0, 24)
        : teachControlCaption(p);
    control.appendChild(faceLab);
    map.appendChild(control);
    const cls = p.now ? "teach-map-box now" : p.later ? "teach-map-box then" : path.length ? "teach-map-box done" : "teach-map-box now";
    const box = el("div", cls);
    box.style.left = Number(p.leftPct) + "%";
    box.style.top = Number(p.topPct) + "%";
    box.style.width = Number(p.wPct) + "%";
    box.style.height = Number(p.hPct) + "%";
    const lab = el("span");
    if (!p.done) {
      lab.textContent = String((p.now && p.cue) || p.label || "").slice(0, 40);
      box.appendChild(lab);
    }
    if (p.now && p.key) {
      const k = el("kbd", "teach-map-key");
      k.textContent = String(p.key).slice(0, 12);
      box.appendChild(k);
    }
    map.appendChild(box);
  });
  paintTeachInk(map, boxes);
  dots.forEach((p) => {
    const mark = el("div", "teach-map-mark");
    mark.style.left = Number(p.xPct) + "%";
    mark.style.top = Number(p.yPct) + "%";
    map.appendChild(mark);
  });
  if (path.length) {
    const rail = el("ol", "teach-map-rail");
    path.forEach((p, i) => {
      const tick = el("button", p.now ? "now" : p.later ? "then" : "done");
      tick.type = "button";
      tick.setAttribute("data-rail", "1");
      tick.setAttribute("data-step", String(i));
      tick.textContent = teachControlCaption(p);
      tick.addEventListener("pointerdown", function (ev) {
        ev.stopPropagation();
      });
      tick.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        onTeachRailStep(i, path, opts && opts.apply);
      });
      rail.appendChild(tick);
    });
    map.appendChild(rail);
  }
  if (draw) wireTeachFrame(map, opts.apply, boxes.find(function (p) { return p.now; }) || null);
  else if (tap) wireTeachTap(map, opts.apply, boxes.find(function (p) { return p.now; }) || null);
  root.appendChild(map);
}

function plateItems(m) {
  const out = [];
  const seen = {};
  function add(line) {
    const text = String(line || "")
      .replace(/^[-*]\s*/, "")
      .trim();
    if (!text || /^nothing yet$/i.test(text)) return;
    const key = text.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(text);
  }
  if (Array.isArray(m && m.plate) && m.plate.length) {
    m.plate.forEach(add);
    return out.slice(0, 6);
  }
  add(m && m.cue);
  const body = String((m && m.deliverable) || "");
  const idx = body.search(/^## On your plate\b/m);
  if (idx >= 0) {
    const rest = body.slice(idx).replace(/^## On your plate[^\n]*\n/, "");
    const chunk = rest.split(/^## /m)[0];
    chunk.split("\n").forEach(add);
  }
  return out.slice(0, 6);
}

function paintTodayPlate(root, m) {
  if (!root || !m || m.desk !== "today" || m.localFirst) return;
  const lines = plateItems(m);
  if (!lines.length) return;
  const card = el("section", "today-plate");
  card.setAttribute("role", "region");
  card.setAttribute("aria-label", "On your plate");
  const kicker = el("p", "today-plate-kicker");
  kicker.textContent = "On your plate";
  card.appendChild(kicker);
  const list = el("ul", "today-plate-list");
  lines.forEach(function (line) {
    const li = el("li");
    li.textContent = line;
    list.appendChild(li);
  });
  card.appendChild(list);
  root.appendChild(card);
}

function sectionAfter(body, heading) {
  const text = String(body || "");
  const needle = "## " + heading;
  const idx = text.indexOf(needle);
  if (idx < 0) return [];
  const rest = text.slice(idx + needle.length);
  const chunk = rest.split(/^## /m)[0];
  return chunk
    .split("\n")
    .map(function (line) {
      return String(line || "")
        .replace(/^[-*]\s*/, "")
        .replace(/^>\s*/, "")
        .trim();
    })
    .filter(function (line) {
      return line && line !== "---" && !/^send is parked/i.test(line) && !/^act:/i.test(line);
    });
}

function draftPreview(m) {
  const ready = String((m && m.preview) || "").trim();
  if (ready) return ready.slice(0, 400);
  const write = sectionAfter(m && m.deliverable, "Draft to write");
  if (write.length) return write.join("\n").slice(0, 400);
  const draft = sectionAfter(m && m.deliverable, "Draft");
  return draft.join("\n").slice(0, 400);
}

function findingItems(m) {
  if (Array.isArray(m && m.findings) && m.findings.length) {
    return m.findings.slice(0, 8).map(function (row) {
      if (typeof row === "string") return row.slice(0, 120);
      const file = String((row && row.file) || "").trim();
      const kind = String((row && row.kind) || "").trim();
      const excerpt = String((row && row.excerpt) || "").trim();
      return [file, kind, excerpt ? "(" + excerpt + ")" : ""].filter(Boolean).join(" ").slice(0, 120);
    }).filter(Boolean);
  }
  return sectionAfter(m && m.deliverable, "Findings (redacted)").slice(0, 8);
}

function paintFiledWindow(root, paint, m, href) {
  if (!root || !m || typeof paint !== "function") return;
  const slot = el("div");
  paint(
    slot,
    {
      title: (m && m.title) || "",
      cue: (m && m.cue) || "",
      preview: (m && m.preview) || "",
      findings: (m && m.findings) || [],
      href: href || "",
    },
    String((m && m.deliverable) || "")
  );
  if (slot.firstChild) root.appendChild(slot.firstChild);
}

function paintInboxCard(root, m, href) {
  if (!root || !m || m.desk !== "inbox" || m.localFirst) return;
  const preview = draftPreview(m);
  const cue = String((m && m.cue) || "").trim();
  if (!preview && !cue && !String((m && m.deliverable) || "").trim()) return;
  paintFiledWindow(root, applyOpenInbox, m, href);
}

function paintDocumentCard(root, m, href) {
  if (!root || !m || m.desk !== "document" || m.localFirst) return;
  const preview = draftPreview(m);
  const cue = String((m && m.cue) || "").trim();
  if (!preview && !cue && !String((m && m.deliverable) || "").trim()) return;
  paintFiledWindow(root, applyOpenDocument, m, href);
}

function paintSecurityCard(root, m, href) {
  if (!root || !m || m.desk !== "security" || m.localFirst) return;
  const hits = findingItems(m);
  const cue = String((m && m.cue) || "").trim();
  if (!hits.length && !cue && !String((m && m.deliverable) || "").trim()) return;
  paintFiledWindow(root, applyOpenSecurity, m, href);
}

function paintWorkRail(root, rooms) {
  if (!root) return;
  const rail = el("div", "work-rail");
  paintInboxCard(rail, (rooms && rooms.inbox) || {}, demoHref("/workspace?id=live-inbox"));
  paintDocumentCard(rail, (rooms && rooms.document) || {}, demoHref("/workspace?id=live-document"));
  paintSecurityCard(rail, (rooms && rooms.security) || {}, demoHref("/workspace?id=live-security"));
  if (rail.childNodes.length) root.appendChild(rail);
}

function applyHomeTeach(m) {
  const root = document.getElementById("stage");
  if (!root || !m) return;
  const map = root.querySelector(".teach-map");
  const holder = document.createElement("div");
  paintTeachMap(holder, m, { draw: true, apply: applyHomeTeach });
  const nextMap = holder.querySelector(".teach-map");
  if (!nextMap) return;
  if (map) map.replaceWith(nextMap);
  else root.insertBefore(nextMap, root.firstChild);
}

function paintStage(rooms, localFirst) {
  const root = document.getElementById("stage");
  if (!root) return;
  root.replaceChildren();
  if (localFirst) {
    root.hidden = true;
    return;
  }
  if (!(isDemoCatalog() && demoInboxSaved())) {
    paintTeachMap(root, (rooms && rooms.teach) || {}, { draw: true, apply: applyHomeTeach });
  }
  paintMeetingCard(root, (rooms && rooms.meeting) || {});
  paintTodayPlate(root, (rooms && rooms.today) || {});
  paintWorkRail(root, rooms);
  root.hidden = !root.childNodes.length;
}

function paintRooms(rooms, localFirst) {
  const root = document.getElementById("rooms");
  if (!root) return;
  root.replaceChildren();
  const labels = {
    teach: "Teach",
    meeting: "Meeting",
    today: "Today",
    document: "Notes",
    inbox: "Unsent mail",
    security: "Needs you",
  };
  ["teach", "meeting", "today", "document", "inbox", "security"].forEach(function (id) {
    const r = (rooms && rooms[id]) || {};
    const a = el("a", "room-dock-tile");
    a.href = demoHref("/" + id);
    const kicker = el("span", "room-dock-kicker");
    kicker.textContent = labels[id] || id;
    a.appendChild(kicker);
    const cue = el("span", "room-dock-cue");
    const cueText = String(r.cue || "").trim();
    const line = id === "teach" ? teachActionLine(r) || cueText : cueText;
    cue.textContent = line || (localFirst ? "on the laptop" : "none yet");
    a.appendChild(cue);
    root.appendChild(a);
  });
}

function paintSession(session, localFirst) {
  const root = document.getElementById("session");
  if (!root) return;
  const askedEl = document.getElementById("session-asked");
  const heardEl = document.getElementById("session-heard");
  const cueEl = document.getElementById("session-cue");
  const plateEl = document.getElementById("session-plate");
  const filesEl = document.getElementById("session-files");
  const mdEl = document.getElementById("session-md");
  const s = session || {};
  const files = Array.isArray(s.files) ? s.files : [];
  const asked = String(s.asked || "").trim();
  const heard = String(s.heard || "").trim();
  const cue = String(s.cue || "").trim();
  const plate = String(s.plate || "").trim();
  const markdown = String(s.markdown || "").trim();
  const empty = Boolean(s.empty) || (!files.length && !asked && !heard && !cue && !plate);
  function setLine(node, prefix, text) {
    if (!node) return;
    node.hidden = !text;
    node.textContent = text ? prefix + text : "";
  }
  function setMarkdown(text) {
    if (!mdEl) return;
    mdEl.textContent = text || "";
    mdEl.hidden = true;
  }
  function setCopy(on) {
    const copyBtn = document.getElementById("session-copy");
    const dlBtn = document.getElementById("session-download");
    if (copyBtn) copyBtn.hidden = !on;
    if (dlBtn) dlBtn.hidden = !on;
  }
  if (localFirst) {
    root.hidden = false;
    setLine(askedEl, "", "");
    setLine(heardEl, "", "");
    setLine(cueEl, "", "");
    setLine(plateEl, "", "");
    setMarkdown("");
    setCopy(false);
    if (filesEl) {
      filesEl.replaceChildren();
      const note = el("p", "muted");
      note.textContent = "Live session stays on the laptop. Open 127.0.0.1:18010 while Pointer is running, or /workspace?demo=1 for a sample coworker.";
      filesEl.appendChild(note);
    }
    paintOpenFileTabs([]);
    return;
  }
  root.hidden = empty;
  setLine(askedEl, "They asked: ", asked);
  setLine(heardEl, "Heard: ", heard);
  setLine(cueEl, "Say this: ", cue);
  setLine(plateEl, "Plate: ", plate);
  setMarkdown(markdown);
  setCopy(Boolean(markdown));
  if (!filesEl) return;
  filesEl.replaceChildren();
  if (!files.length) {
    const note = el("p", "muted");
    note.textContent = empty ? "No live session yet." : "No filed artifacts yet.";
    filesEl.appendChild(note);
    paintOpenFileTabs([]);
    return;
  }
  files.forEach((row) => {
    const tile = paintSessionTile(row);
    if (tile) filesEl.appendChild(tile);
  });
  paintOpenFileTabs(files);
}

function copyNodeText(id) {
  const node = document.getElementById(id);
  if (!node) return;
  const pre = node.tagName === "PRE" ? node : node.querySelector("pre");
  const text = String((pre || node).textContent || "");
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function () {});
  }
}

function downloadMarkdown(filename, text) {
  const body = String(text || "");
  if (!body) return;
  const blob = new Blob([body], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = el("a");
  a.href = url;
  a.download = filename || "pointer-session.md";
  a.click();
  URL.revokeObjectURL(url);
}

function briefFileName(desk) {
  const d = String(desk || "brief")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 24);
  return "pointer-" + (d || "brief") + ".md";
}

let lastBriefText = "";
let lastBriefFile = "pointer-brief.md";
let lastArtifactText = "";
let lastArtifactFile = "pointer-artifact.md";
let lastCueText = "";

function setBriefButtons(text, desk, localFirst) {
  const has = Boolean(String(text || "").trim()) && !localFirst;
  lastBriefText = has ? String(text) : "";
  lastBriefFile = briefFileName(desk);
  const copyBtn = document.getElementById("brief-copy");
  const dlBtn = document.getElementById("brief-download");
  if (copyBtn) copyBtn.hidden = !has;
  if (dlBtn) dlBtn.hidden = !has;
}

function setCueButton(text, localFirst) {
  const has = Boolean(String(text || "").trim()) && !localFirst;
  lastCueText = has ? String(text) : "";
  const btn = document.getElementById("cue-copy");
  if (btn) btn.hidden = !has;
}

function copyPlain(text) {
  const body = String(text || "");
  if (!body) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(body).catch(function () {});
  }
}

const sessionCopy = document.getElementById("session-copy");
if (sessionCopy) {
  sessionCopy.addEventListener("click", function () {
    copyNodeText("session-md");
  });
}

const sessionDownload = document.getElementById("session-download");
if (sessionDownload) {
  sessionDownload.addEventListener("click", function () {
    fetch("/api/session.zip")
      .then(function (r) {
        if (!r.ok) throw new Error("no packet");
        return r.blob();
      })
      .then(function (blob) {
        const url = URL.createObjectURL(blob);
        const a = el("a");
        a.href = url;
        a.download = "pointer-session.zip";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(function () {});
  });
}

const briefCopy = document.getElementById("brief-copy");
if (briefCopy) {
  briefCopy.addEventListener("click", function () {
    copyPlain(lastBriefText);
  });
}

const cueCopy = document.getElementById("cue-copy");
if (cueCopy) {
  cueCopy.addEventListener("click", function () {
    copyPlain(lastCueText);
  });
}

const briefDownload = document.getElementById("brief-download");
if (briefDownload) {
  briefDownload.addEventListener("click", function () {
    downloadMarkdown(lastBriefFile, lastBriefText);
  });
}

const docxDownload = document.getElementById("docx-download");
if (docxDownload) {
  docxDownload.addEventListener("click", function () {
    fetch("/api/document.docx")
      .then(function (r) {
        if (!r.ok) throw new Error("no draft");
        return r.blob();
      })
      .then(function (blob) {
        const url = URL.createObjectURL(blob);
        const a = el("a");
        a.href = url;
        a.download = "pointer-draft.docx";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(function () {});
  });
}

const emlDownload = document.getElementById("eml-download");
if (emlDownload) {
  emlDownload.addEventListener("click", function () {
    fetch("/api/inbox.eml")
      .then(function (r) {
        if (!r.ok) throw new Error("no draft");
        return r.blob();
      })
      .then(function (blob) {
        const url = URL.createObjectURL(blob);
        const a = el("a");
        a.href = url;
        a.download = "pointer-draft.eml";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(function () {});
  });
}

const reportDownload = document.getElementById("report-download");
if (reportDownload) {
  reportDownload.addEventListener("click", function () {
    fetch("/api/security.md")
      .then(function (r) {
        if (!r.ok) throw new Error("no review");
        return r.blob();
      })
      .then(function (blob) {
        const url = URL.createObjectURL(blob);
        const a = el("a");
        a.href = url;
        a.download = "pointer-review.md";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(function () {});
  });
}

const artifactCopy = document.getElementById("artifact-copy");
if (artifactCopy) {
  artifactCopy.addEventListener("click", function () {
    copyPlain(lastArtifactText);
  });
}

const artifactDownload = document.getElementById("artifact-download");
if (artifactDownload) {
  artifactDownload.addEventListener("click", function () {
    downloadMarkdown(lastArtifactFile, lastArtifactText);
  });
}

const roomsPage = document.getElementById("rooms");
if (roomsPage) {
  pollWhileLive(function () {
    return fetch("/api/home")
      .then((r) => r.json())
      .then((h) => {
        if (h && h.exec) {
          show("policy", "refused: home must not grow a runtime");
          return false;
        }
        if (paintDemoIfPublic(h)) return false;
        show("policy", (h && h.reason) || "live coworker rooms; Act stays on the laptop");
        paintRooms((h && h.rooms) || {}, Boolean(h && h.localFirst));
        paintStage((h && h.rooms) || {}, Boolean(h && h.localFirst));
        paintSession(h && h.session, Boolean(h && h.localFirst));
        paintChrome(h);
        return !(h && h.localFirst);
      });
  });
}

const lanesPage = document.getElementById("lanes");
if (lanesPage) {
  pollWhileLive(function () {
    return fetch("/api/state")
      .then((r) => r.json())
      .then((s) => {
        if (s && s.exec) {
          show("policy", "refused: lanes must not grow a runtime");
          return false;
        }
        if (paintDemoIfPublic(s)) return false;
        show(
          "policy",
          s && s.localFirst
            ? s.reason || "live lanes stay on the laptop"
            : "Live lanes on this machine. A second owner is refused."
        );
        paintLanes((s && s.lanes) || {});
        return !(s && s.localFirst);
      });
  });
}

const skillsPage = document.getElementById("hits");
if (skillsPage) {
  pollWhileLive(function () {
    return fetch("/api/state")
      .then((r) => r.json())
      .then((s) => {
        if (s && s.exec) {
          show("policy", "refused: skills must not grow a runtime");
          return false;
        }
        if (paintDemoIfPublic(s)) return false;
        show(
          "policy",
          s && s.localFirst
            ? "Skill search stays on the laptop. Craft cannot emit actions."
            : "Live skill hits. A miss is a hint draft with empty actions."
        );
        paintList(
          "hits",
          (s && s.lastSearch) || [],
          "No search hits on this host.",
          (h) => (h.id || h.title || "hit") + (h.score != null ? " · " + h.score : "")
        );
        paintList(
          "drafts",
          (s && s.drafts) || [],
          "No hint drafts.",
          (d) => (d.title || d.id || "draft") + " · " + (d.tier || "hint")
        );
        return !(s && s.localFirst);
      });
  });
}

if (!document.getElementById("rooms")) {
  pollWhileLive(function () {
    return fetch("/api/home")
      .then((r) => r.json())
      .then(function (h) {
        if (h && h.exec) return false;
        if (paintDemoIfPublic(h)) return false;
        paintChrome(h);
        return !(h && h.localFirst);
      });
  });
}

let demoTeachStep = 0;
let demoDrawn = [];

function demoClipBox(left, top, w, h) {
  if (!Number.isFinite(left) || !Number.isFinite(top) || !(w > 0) || !(h > 0)) return null;
  if (left < 0 || top < 0 || left >= 100 || top >= 100) return null;
  const right = Math.min(100, left + w);
  const bottom = Math.min(100, top + h);
  const ww = right - Math.max(0, left);
  const hh = bottom - Math.max(0, top);
  if (ww < 0.4 || hh < 0.4) return null;
  return { leftPct: Math.max(0, left), topPct: Math.max(0, top), wPct: ww, hPct: hh };
}

function demoParseFrame(spec) {
  if (!spec || typeof spec !== "object") return null;
  const stroke = Array.isArray(spec.stroke) ? spec.stroke : [];
  if (stroke.length >= 2) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    stroke.forEach(function (p) {
      const x = Number(p && p.x);
      const y = Number(p && p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    });
    return demoClipBox(x0, y0, x1 - x0, y1 - y0);
  }
  const x0 = Number(spec.x0);
  const y0 = Number(spec.y0);
  const x1 = Number(spec.x1);
  const y1 = Number(spec.y1);
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return null;
  return demoClipBox(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
}

function demoFrameTeach(spec) {
  if (demoTeachWalk().length >= 8) return false;
  const box = demoParseFrame(spec);
  if (!box) return false;
  const wasSaved = demoInboxSaved();
  const n = demoTeachWalk().length + 1;
  const ink = Array.isArray(spec && spec.stroke)
    ? spec.stroke.filter(function (p) {
        return Number.isFinite(Number(p && p.x)) && Number.isFinite(Number(p && p.y));
      }).slice(0, 80).map(function (p) {
        return { x: Number(p.x), y: Number(p.y) };
      })
    : [];
  demoDrawn.push({
    leftPct: box.leftPct,
    topPct: box.topPct,
    wPct: box.wPct,
    hPct: box.hPct,
    label: n + " region",
    cue: "Look at region " + n,
    face: "region",
    caption: "region " + n,
    stroke: ink.length >= 2 ? ink : undefined,
  });
  if (wasSaved) demoTeachStep = demoTeachWalk().length - 1;
  return true;
}

function demoTeachWalk() {
  return [
    {
      leftPct: 18,
      topPct: 28,
      wPct: 48,
      hPct: 14,
      label: "1 Email",
      cue: "Type in Email",
      face: "field",
      caption: "Email",
      fill: "Sarah Chen",
      stroke: [
        { x: 18, y: 28 },
        { x: 66, y: 28 },
        { x: 66, y: 42 },
        { x: 18, y: 42 },
        { x: 18, y: 28 },
      ],
    },
    {
      leftPct: 52,
      topPct: 52,
      wPct: 22,
      hPct: 12,
      label: "2 Save",
      cue: "Click Save",
      face: "button",
      caption: "Save",
    },
  ].concat(demoDrawn);
}

function demoAdvanceTeach(ask) {
  const q = String(ask || "").toLowerCase();
  const last = demoTeachWalk().length - 1;
  if (/\bback\b/.test(q)) {
    if (demoTeachStep >= demoTeachWalk().length) demoTeachStep = last;
    else demoTeachStep = Math.max(0, demoTeachStep - 1);
  } else demoTeachStep = Math.min(demoTeachWalk().length, demoTeachStep + 1);
}

function demoInboxSaved() {
  return demoTeachStep >= demoTeachWalk().length;
}

function demoTeachRoom() {
  const walk = demoTeachWalk();
  const saved = demoInboxSaved();
  const last = walk.length - 1;
  const step = saved ? last : Math.max(0, Math.min(demoTeachStep, last));
  const path = walk.map(function (p, i) {
    return Object.assign({}, p, {
      now: !saved && i === step,
      later: !saved && i > step,
      done: saved || i < step,
      caption: saved && /save/i.test(String((p.caption || p.label || "") || "")) ? "Saved" : p.caption,
    });
  });
  return {
    ok: true,
    act: false,
    exec: false,
    demo: true,
    localFirst: false,
    desk: "teach",
    advance: true,
    title: "Teach walk",
    action: saved ? "Saved on This computer" : walk[step].cue,
    cue: saved ? "Saved on This computer" : walk[step].cue,
    rest: saved ? "" : walk[step + 1] ? walk[step + 1].cue : "",
    path: path,
    deliverable: "Demo walk. Type in Email, then Click Save. Never Act.",
    reason: "Demo catalog. Not your live session. Never Act.",
  };
}

function demoHome() {
  const teach = demoTeachRoom();
  const meeting = {
    ok: true,
    act: false,
    exec: false,
    demo: true,
    localFirst: false,
    desk: "meeting",
    title: "Live answer",
    asked: "Can we ship Friday?",
    cue: "Friday works if the deck is in tonight.",
    heard: "Sarah Chen / Friday / $40k",
    also: "Name the Friday hold.",
    avoid: "Don't promise a send.",
    turns: [
      { speaker: "them", text: "Can we ship Friday?" },
      { speaker: "you", text: "Friday works if the deck is in tonight." },
    ],
    captions: [{ text: "Can we ship Friday?" }],
    deliverable: "Demo meeting. Never send. Never a cheater overlay.",
  };
  const today = {
    ok: true,
    act: false,
    exec: false,
    demo: true,
    localFirst: false,
    desk: "today",
    title: "Today",
    cue: "Send the deck Friday",
    plate: ["Send the deck Friday", "Word notes waiting"],
    deliverable: "## On your plate\n- Send the deck Friday\n- Word notes waiting",
  };
  const document = {
    ok: true,
    act: false,
    exec: false,
    demo: true,
    localFirst: false,
    desk: "document",
    title: "Notes from Friday",
    cue: "draft only - not a .docx",
    preview: "Recap\nFriday works if the deck is in tonight.\n\nCommitments\nSend the deck Friday.",
    deliverable: "## Draft to write\nRecap\nFriday works if the deck is in tonight.\n\nCommitments\nSend the deck Friday.",
  };
  const inbox = {
    ok: true,
    act: false,
    exec: false,
    demo: true,
    localFirst: false,
    desk: "inbox",
    title: "Draft follow-up (not sent)",
    cue: demoInboxSaved() ? "saved on This computer" : "not sent",
    preview: "To: " + (demoTeachStep > 0 ? "Sarah Chen" : "not sent") + "\nSubject: Friday deck\n\nFriday works if the deck is in tonight.",
    deliverable: "## Draft\nTo: " + (demoTeachStep > 0 ? "Sarah Chen" : "not sent") + "\nSubject: Friday deck\n\nFriday works if the deck is in tonight.",
  };
  const security = {
    ok: true,
    act: false,
    exec: false,
    demo: true,
    localFirst: false,
    desk: "security",
    title: "Needs you",
    cue: "not approval",
    findings: [{ file: "notes", kind: "secret", excerpt: "[redacted]" }],
    deliverable: "## Findings (redacted)\n- notes secret ([redacted])\n\nNeeds you. Never approval.",
  };
  const files = [
    { id: "live-teach", desk: "teach", title: "Teach walk", cue: teach.cue, href: "/workspace?id=live-teach" },
    { id: "live-meeting", desk: "meeting", title: "Live answer", cue: meeting.cue, href: "/workspace?id=live-meeting" },
    { id: "live-document", desk: "document", title: "Notes from Friday", cue: document.cue, href: "/workspace?id=live-document" },
    { id: "live-inbox", desk: "inbox", title: "Unsent mail", cue: inbox.cue, href: "/workspace?id=live-inbox" },
    { id: "live-security", desk: "security", title: "Needs you", cue: security.cue, href: "/workspace?id=live-security" },
  ];
  return {
    ok: true,
    act: false,
    exec: false,
    demo: true,
    localFirst: false,
    reason: "Demo catalog. Not your live session. Run is refused (P-06).",
    rooms: { teach: teach, meeting: meeting, today: today, document: document, inbox: inbox, security: security },
    session: {
      asked: meeting.asked,
      heard: meeting.heard,
      cue: meeting.cue,
      plate: today.cue,
      files: files,
      markdown: "Demo session. Never Act. Never send.",
      empty: false,
    },
    desks: [
      { id: "teach", label: "Teach", job: "Walk this screen", deliverable: "measured BOX", act: "never" },
      { id: "meeting", label: "Meeting", job: "Live answer", deliverable: "say-this", act: "never" },
      { id: "today", label: "Today", job: "Standing plate", deliverable: "commitments", act: "never" },
      { id: "document", label: "Notes", job: "Word draft", deliverable: "generated .docx", act: "never" },
      { id: "inbox", label: "Unsent mail", job: "Follow-up", deliverable: "unsent .eml", act: "never", parked: true },
      { id: "security", label: "Needs you", job: "Review", deliverable: "redacted review", act: "never" },
    ],
    artifacts: files.map(function (row) {
      return { id: row.id, desk: row.desk, title: row.title };
    }),
    chips: demoAskChips(),
  };
}

function demoArtifact(id) {
  const home = demoHome();
  const rooms = home.rooms || {};
  const key = String(id || "").toLowerCase();
  const map = {
    "live-teach": rooms.teach,
    "live-meeting": rooms.meeting,
    "live-document": rooms.document,
    "live-inbox": rooms.inbox,
    "live-security": rooms.security,
    "standing-today": rooms.today,
  };
  const m = map[key];
  if (!m) return null;
  return {
    ok: true,
    exec: false,
    act: false,
    demo: true,
    localFirst: false,
    artifact: {
      id: key,
      desk: m.desk,
      title: m.title,
      cue: m.cue,
      preview: m.preview,
      findings: m.findings,
      body: m.deliverable,
    },
    chips: [],
  };
}

function openDemoArtifact(id) {
  const root = document.getElementById("artifact-body");
  if (!root || !id) return;
  const body = demoArtifact(id);
  if (!body) {
    paintOpenPre(root, "Demo catalog has no file " + id);
    setFinishedDownloads(null, { localFirst: true });
    return;
  }
  const text = String(body.artifact.body || "");
  root.replaceChildren();
  paintOpenFileBody(root, body, text);
  setWorkingSet(String(body.artifact.id || id), String(body.artifact.title || id));
  lastArtifactText = text;
  lastArtifactFile = briefFileName(body.artifact.desk || id);
  lastOpenId = String(body.artifact.id || id);
  paintDeskChips("artifact-chips", []);
  const copyBtn = document.getElementById("artifact-copy");
  const dlBtn = document.getElementById("artifact-download");
  if (copyBtn) copyBtn.hidden = !text;
  if (dlBtn) dlBtn.hidden = true;
  setFinishedDownloads(null, { localFirst: true, exec: false });
}

function applyDemoCatalog() {
  if (paintingDemo) return;
  paintingDemo = true;
  demoCatalogOn = true;
  try {
    const home = demoHome();
    show("policy", home.reason);
    show("hint", home.reason);
    paintComputerDock({ localFirst: false, reason: home.reason });
    paintDesks(home.desks);
    artifactCache = home.artifacts || [];
    paintArtifacts(home.artifacts || []);
    paintRooms(home.rooms, false);
    paintStage(home.rooms, false);
    paintSession(home.session, false);
    paintChrome(home);
    if (pageDesk() === "today") applyToday(home.rooms.today);
    const pages = [
      ["teach-brief", "teach-cue-web", "refused: teach must not grow a runtime", null, home.rooms.teach],
      ["meeting-brief", "meeting-cue-web", "refused: meeting must not grow a runtime", "meeting-asked-web", home.rooms.meeting],
      ["document-brief", "document-cue-web", "refused: document must not grow a runtime", null, home.rooms.document],
      ["inbox-brief", "inbox-cue-web", "refused: inbox must not grow a runtime", null, home.rooms.inbox],
      ["security-brief", "security-cue-web", "refused: security must not grow a runtime", null, home.rooms.security],
    ];
    pages.forEach(function (row) {
      const page = document.getElementById(row[0]);
      if (!page) return;
      applyLiveRoom(page, row[0], row[1], row[3], row[2], row[4]);
    });
    if (!openedQueryId) {
      openedQueryId = true;
      const qid = workspaceQueryId();
      if (qid) openDemoArtifact(qid);
    }
    demoHighlightWalk();
  } finally {
    paintingDemo = false;
  }
}

if (isDemoPage()) applyDemoCatalog();

