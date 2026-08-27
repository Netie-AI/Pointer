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
    const btn = el("button", "artifact");
    btn.type = "button";
    btn.textContent = (row.title || row.id || "untitled") + " · " + (row.desk || "desk");
    btn.addEventListener("click", () => openArtifact(row.id));
    li.appendChild(btn);
    root.appendChild(li);
  });
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
      const pre = el("pre");
      pre.textContent = text;
      root.appendChild(pre);
      const ok = Boolean(body && body.ok && body.artifact && String(body.artifact.body || "").trim());
      lastArtifactText = ok ? String(body.artifact.body) : "";
      lastArtifactFile = briefFileName((body && body.artifact && (body.artifact.desk || body.artifact.id)) || id);
      const copyBtn = document.getElementById("artifact-copy");
      const dlBtn = document.getElementById("artifact-download");
      if (copyBtn) copyBtn.hidden = !ok;
      if (dlBtn) dlBtn.hidden = !ok;
    })
    .catch((err) => {
      root.replaceChildren();
      const pre = el("pre");
      pre.textContent = String(err);
      root.appendChild(pre);
      lastArtifactText = "";
      const copyBtn = document.getElementById("artifact-copy");
      const dlBtn = document.getElementById("artifact-download");
      if (copyBtn) copyBtn.hidden = true;
      if (dlBtn) dlBtn.hidden = true;
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

const workspacePage = document.getElementById("desks");
if (workspacePage) {
  pollWhileLive(function () {
    return Promise.all([
      fetch("/api/workspace").then((r) => r.json()),
      fetch("/api/state").then((r) => r.json()).catch(() => ({})),
    ]).then(([ws, state]) => {
      if (ws && ws.exec) {
        show("policy", "refused: public workspace must not grow a runtime");
        return false;
      }
      show(
        "policy",
        (ws && ws.reason) || "workspace has no runtime; Act stays on the laptop"
      );
      paintDesks((ws && ws.desks) || (state && state.desks) || []);
      paintArtifacts((ws && ws.artifacts) || []);
      paintSession(ws && ws.session, Boolean(ws && ws.localFirst));
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
  return !(t && t.localFirst);
}

function paintTodayChips(chips) {
  const root = document.getElementById("today-chips");
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
  fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ask: ask, act: false }),
  })
    .then((r) => r.json())
    .then(function (out) {
      const filed = document.getElementById("host-filed") || document.getElementById("today-filed");
      const ok = Boolean(out && out.ok);
      if (filed) {
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
        filed.hidden = !line;
        filed.textContent = line;
      }
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
            paintSession(h && h.session, Boolean(h && h.localFirst));
          }
        })
        .catch(function () {});
    })
    .catch(function () {});
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
    cue.hidden = !text;
    const prefix =
      (m && m.desk) === "teach"
        ? "Next: "
        : (m && m.desk) === "meeting"
          ? "Say this: "
          : (m && m.desk) === "today"
            ? "Plate: "
            : "Review: ";
    cue.textContent = text ? prefix + text : "";
  }
  setCueButton(text, Boolean(m && m.localFirst));
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
  paintMeetingChips((m && m.chips) || []);
  page.replaceChildren();
  paintTeachMap(page, (m && m.markers) || []);
  const pre = el("pre");
  pre.textContent = (m && m.deliverable) || "";
  page.appendChild(pre);
  setBriefButtons((m && m.deliverable) || "", (m && m.desk) || "brief", Boolean(m && m.localFirst));
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
  const root = document.getElementById("meeting-chips");
  if (!root) return;
  root.replaceChildren();
  (chips || []).forEach(function (c) {
    const q = String(c.q || "").trim();
    if (!q) return;
    const b = el("button");
    b.type = "button";
    b.textContent = String(c.label || q).slice(0, 48);
    b.addEventListener("click", function () { postMeeting(q); });
    root.appendChild(b);
  });
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
  bar.appendChild(text);
  bar.appendChild(actions);
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
  const plate = String(s.plate || "").trim();
  let cueLine = "";
  if (asked && meetingCue) cueLine = "Say this: " + meetingCue;
  else if (teachCue) cueLine = "Next: " + teachCue;
  else if (plate) cueLine = "Plate: " + plate;
  else if (meetingCue) cueLine = "Say this: " + meetingCue;
  const askedEl = document.getElementById("live-cue-asked");
  const heardEl = document.getElementById("live-cue-heard");
  const textEl = document.getElementById("live-cue-text");
  if (askedEl) {
    askedEl.hidden = !asked;
    askedEl.textContent = asked ? "They asked: " + asked : "";
  }
  if (heardEl) {
    heardEl.hidden = !heard;
    heardEl.textContent = heard ? "Heard: " + heard : "";
  }
  if (textEl) textEl.textContent = cueLine;
  lastChromeCue = meetingCue || teachCue || plate;
  bar.hidden = false;
  const canWalk = Boolean(teach.advance);
  const back = document.getElementById("live-cue-back");
  const next = document.getElementById("live-cue-next");
  const copy = document.getElementById("live-cue-copy");
  if (back) back.hidden = !canWalk;
  if (next) next.hidden = !canWalk;
  if (copy) copy.hidden = !lastChromeCue;
}

paintLiveRoom("meeting-brief", "/api/meeting", "meeting-cue-web", "refused: meeting must not grow a runtime", "meeting-asked-web");
paintLiveRoom("teach-brief", "/api/teach", "teach-cue-web", "refused: teach must not grow a runtime");
paintLiveRoom("security-brief", "/api/security", "security-cue-web", "refused: security must not grow a runtime");
paintLiveRoom("document-brief", "/api/document", "document-cue-web", "refused: document must not grow a runtime");
paintLiveRoom("inbox-brief", "/api/inbox", "inbox-cue-web", "refused: inbox must not grow a runtime");

function paintTeachMap(root, markers) {
  if (!root) return;
  const boxes = (markers || []).filter((p) => Number(p.wPct) > 0 && Number(p.hPct) > 0);
  if (!boxes.length) return;
  const map = el("div", "teach-map");
  map.setAttribute("aria-hidden", "true");
  boxes.forEach((p) => {
    const box = el("div", "teach-map-box now");
    box.style.left = Number(p.leftPct) + "%";
    box.style.top = Number(p.topPct) + "%";
    box.style.width = Number(p.wPct) + "%";
    box.style.height = Number(p.hPct) + "%";
    const lab = el("span");
    lab.textContent = String(p.label || "").slice(0, 40);
    box.appendChild(lab);
    map.appendChild(box);
  });
  root.appendChild(map);
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
      const prefix = id === "teach" ? "Next: " : id === "meeting" ? "Say this: " : id === "today" ? "Plate: " : "Review: ";
      cue.textContent = prefix + cueText;
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
      const li = el("li", "muted");
      li.textContent = "Live session stays on the laptop. Open 127.0.0.1:18010 while Pointer is running.";
      filesEl.appendChild(li);
    }
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
    const li = el("li", "muted");
    li.textContent = empty ? "No live session yet." : "No filed artifacts yet.";
    filesEl.appendChild(li);
    return;
  }
  files.forEach((row) => {
    const li = el("li");
    const a = el("a");
    const desk = String(row.desk || "");
    a.href =
      desk === "teach" ||
      desk === "meeting" ||
      desk === "today" ||
      desk === "document" ||
      desk === "security" ||
      desk === "inbox"
        ? "/" + desk
        : "/workspace";
    a.textContent = String(row.title || row.id || "artifact");
    li.appendChild(a);
    const cueText = String(row.cue || "").trim();
    if (cueText) {
      const extra = el("span", "muted");
      extra.textContent = " - " + cueText;
      li.appendChild(extra);
    }
    filesEl.appendChild(li);
  });
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
    const mdEl = document.getElementById("session-md");
    downloadMarkdown("pointer-session.md", mdEl ? mdEl.textContent : "");
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
