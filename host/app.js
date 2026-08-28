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
function pollWhileLive(load) {
  let timer = null;
  function tick() {
    if (typeof document !== "undefined" && document.hidden) return;
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
  if (!root) return;
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
    return href;
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
    return "/" + desk;
  }
  return "/workspace";
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

function notesWindowBody(text, preview) {
  const fromDraft = sectionAfter(text, "Draft to write").join("\n").trim();
  if (fromDraft) return fromDraft.slice(0, 1500);
  return String(preview || "").trim().slice(0, 1500);
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
    body: draft,
    foot: "not sent - send is parked (P-05)",
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

const workspacePage = document.getElementById("desks");
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
if (todayPage) {
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
  show("policy", (t && t.reason) || "standing brief; Act stays on the laptop");
  const plate = document.getElementById("today-cue-web");
  const plateText = String((t && t.cue) || "").trim();
  if (plate) {
    plate.hidden = !plateText;
    plate.textContent = plateText ? "Plate: " + plateText : "";
  }
  setCueButton(plateText, Boolean(t && t.localFirst));
  paintBrief((t && (t.deliverable || t.brief)) || "", "today", Boolean(t && t.localFirst));
  paintEvents((t && (t.events || t.today)) || []);
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

function postAsk(ask) {
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
    no.textContent = "Don't say: " + avoid;
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
    restEl.hidden = !rest;
    restEl.textContent = rest ? "Then: " + rest : "";
  }
  setTeachButtons(m);
  paintDeskChips(pageId.replace("-brief", "-chips"), (m && m.chips) || []);
  page.replaceChildren();
  paintTeachMap(page, m, pageId === "teach-brief" ? { draw: true, apply: function (next) { applyLiveRoom(page, pageId, cueId, askedId, refuse, next); } } : undefined);
  paintMeetingCard(page, m);
  paintTalk(page, m);
  paintInboxCard(page, m);
  paintDocumentCard(page, m);
  paintSecurityCard(page, m);
  const pre = el("pre");
  pre.textContent = (m && m.deliverable) || "";
  page.appendChild(pre);
  setBriefButtons((m && m.deliverable) || "", (m && m.desk) || "brief", Boolean(m && m.localFirst));
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
      heardEl.hidden = !teachRest;
      heardEl.textContent = teachRest ? "Then: " + teachRest : "";
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
  lastChromeCue = onTeach ? teachAction || teachCue : meetingCue || plate;
  bar.hidden = false;
  const canWalk = onTeach && Boolean(teach.advance);
  const back = document.getElementById("live-cue-back");
  const next = document.getElementById("live-cue-next");
  const copy = document.getElementById("live-cue-copy");
  if (back) back.hidden = !canWalk;
  if (next) next.hidden = !canWalk;
  if (copy) copy.hidden = !lastChromeCue;
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

function paintTeachMap(root, m, opts) {
  if (!root || (m && m.desk && m.desk !== "teach") || (m && m.localFirst)) return;
  const draw = Boolean(opts && opts.draw) && !(m && m.localFirst) && !(m && m.exec);
  const path = Array.isArray(m && m.path) && m.path.length ? m.path : [];
  const markers = Array.isArray(m && m.markers) ? m.markers : [];
  const boxes = path.length
    ? path.filter((p) => Number(p.wPct) > 0 && Number(p.hPct) > 0)
    : markers.filter((p) => Number(p.wPct) > 0 && Number(p.hPct) > 0);
  const dots = path.length
    ? path.filter((p) => p.now && Number.isFinite(Number(p.xPct)) && Number.isFinite(Number(p.yPct)))
    : markers.filter((p) => Number.isFinite(Number(p.xPct)) && Number.isFinite(Number(p.yPct)));
  if (!boxes.length && !dots.length && !draw) return;
  const map = el("div", draw ? "teach-map draw" : "teach-map");
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
  }
  boxes.forEach((p) => {
    const face = teachControlFace(p);
    const control = el("div", "teach-map-control " + face);
    control.style.left = Number(p.leftPct) + "%";
    control.style.top = Number(p.topPct) + "%";
    control.style.width = Number(p.wPct) + "%";
    control.style.height = Number(p.hPct) + "%";
    const faceLab = el("span", "teach-map-face");
    faceLab.textContent = teachControlCaption(p);
    control.appendChild(faceLab);
    map.appendChild(control);
    const cls = p.now ? "teach-map-box now" : p.later ? "teach-map-box then" : path.length ? "teach-map-box done" : "teach-map-box now";
    const box = el("div", cls);
    box.style.left = Number(p.leftPct) + "%";
    box.style.top = Number(p.topPct) + "%";
    box.style.width = Number(p.wPct) + "%";
    box.style.height = Number(p.hPct) + "%";
    const lab = el("span");
    lab.textContent = String((p.now && p.cue) || p.label || "").slice(0, 40);
    box.appendChild(lab);
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
    path.forEach((p) => {
      const li = el("li", p.now ? "now" : p.later ? "then" : "done");
      li.textContent = String(p.cue || p.label || "").slice(0, 80);
      rail.appendChild(li);
    });
    map.appendChild(rail);
  }
  if (draw) wireTeachFrame(map, opts.apply, boxes.find(function (p) { return p.now; }) || null);
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

function paintWorkCard(root, cls, label, body, foot, href) {
  if (!root) return;
  const card = el("article", "work-card " + cls);
  card.setAttribute("role", "region");
  card.setAttribute("aria-label", label);
  const kicker = el("p", "work-card-kicker");
  kicker.textContent = label;
  card.appendChild(kicker);
  if (body) {
    const pre = el("p", "work-card-body");
    pre.textContent = body;
    card.appendChild(pre);
  }
  if (foot) {
    const f = el("p", "work-card-foot");
    f.textContent = foot;
    card.appendChild(f);
  }
  if (href) {
    const a = el("a", "work-card-open");
    a.href = href;
    a.textContent = "Open in workspace";
    card.appendChild(a);
  }
  root.appendChild(card);
}

function paintInboxCard(root, m, href) {
  if (!root || !m || m.desk !== "inbox" || m.localFirst) return;
  const preview = draftPreview(m);
  const cue = String((m && m.cue) || "").trim();
  if (!preview && !cue) return;
  paintWorkCard(root, "work-inbox", "Unsent follow-up", preview || cue, "not sent", href);
}

function paintDocumentCard(root, m, href) {
  if (!root || !m || m.desk !== "document" || m.localFirst) return;
  const preview = draftPreview(m);
  const cue = String((m && m.cue) || "").trim();
  if (!preview && !cue) return;
  paintWorkCard(root, "work-document", "Word draft", preview || cue, "not a .docx", href);
}

function paintSecurityCard(root, m, href) {
  if (!root || !m || m.desk !== "security" || m.localFirst) return;
  const hits = findingItems(m);
  const cue = String((m && m.cue) || "").trim();
  if (!hits.length && !cue) return;
  const card = el("article", "work-card work-security");
  card.setAttribute("role", "region");
  card.setAttribute("aria-label", "Security review");
  const kicker = el("p", "work-card-kicker");
  kicker.textContent = "Security review";
  card.appendChild(kicker);
  if (cue) {
    const head = el("p", "work-card-body");
    head.textContent = cue;
    card.appendChild(head);
  }
  if (hits.length) {
    const list = el("ul", "work-hits");
    hits.forEach(function (line) {
      const li = el("li");
      li.textContent = line;
      list.appendChild(li);
    });
    card.appendChild(list);
  }
  const foot = el("p", "work-card-foot");
  foot.textContent = "do not approve";
  card.appendChild(foot);
  if (href) {
    const a = el("a", "work-card-open");
    a.href = href;
    a.textContent = "Open in workspace";
    card.appendChild(a);
  }
  root.appendChild(card);
}

function paintWorkRail(root, rooms) {
  if (!root) return;
  const rail = el("div", "work-rail");
  paintInboxCard(rail, (rooms && rooms.inbox) || {}, "/workspace?id=live-inbox");
  paintDocumentCard(rail, (rooms && rooms.document) || {}, "/workspace?id=live-document");
  paintSecurityCard(rail, (rooms && rooms.security) || {}, "/workspace?id=live-security");
  if (rail.childNodes.length) root.appendChild(rail);
}

function paintStage(rooms, localFirst) {
  const root = document.getElementById("stage");
  if (!root) return;
  root.replaceChildren();
  if (localFirst) {
    root.hidden = true;
    return;
  }
  paintTeachMap(root, (rooms && rooms.teach) || {});
  paintMeetingCard(root, (rooms && rooms.meeting) || {});
  paintTodayPlate(root, (rooms && rooms.today) || {});
  paintWorkRail(root, rooms);
  root.hidden = !root.childNodes.length;
}

function paintRooms(rooms, localFirst) {
  const root = document.getElementById("rooms");
  if (!root) return;
  root.replaceChildren();
  ["teach", "meeting", "today", "document", "security", "inbox"].forEach((id) => {
    const r = (rooms && rooms[id]) || {};
    const card = el("article", "desk");
    const h = el("h3");
    const a = el("a");
    a.href = "/" + id;
    a.textContent = r.title || id;
    h.appendChild(a);
    const cue = el("p", "muted");
    const cueText = String(r.cue || "").trim();
    if (cueText) {
      const prefix = id === "teach" ? "" : id === "meeting" ? "Say this: " : id === "today" ? "Plate: " : "Review: ";
      const line = id === "teach" ? teachActionLine(r) || cueText : cueText;
      cue.textContent = prefix + line;
    } else {
      cue.textContent = localFirst ? "Live " + id + " stays on the laptop." : "No live " + id + " yet.";
    }
    const restText = String(r.rest || "").trim();
    const pre = el("pre");
    pre.textContent = String(r.deliverable || "").slice(0, 400);
    card.appendChild(h);
    card.appendChild(cue);
    if (id === "meeting") {
      const askedText = String(r.asked || "").trim();
      if (askedText) {
        const asked = el("p", "muted");
        asked.textContent = "They asked: " + askedText;
        card.appendChild(asked);
      }
    }
    if (id === "teach" && restText) {
      const then = el("p", "muted");
      then.textContent = "Then: " + restText;
      card.appendChild(then);
    }
    const heardText = String(r.heard || "").trim();
    if (id === "meeting" && heardText) {
      const heard = el("p", "muted");
      heard.textContent = "Heard: " + heardText;
      card.appendChild(heard);
    }
    card.appendChild(pre);
    root.appendChild(card);
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
    mdEl.hidden = !text;
    mdEl.textContent = text || "";
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
      note.textContent = "Live session stays on the laptop. Open 127.0.0.1:18010 while Pointer is running.";
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
        paintChrome(h);
        return !(h && h.localFirst);
      });
  });
}
