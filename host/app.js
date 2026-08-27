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
  function arm(keep) {
    if (keep === false) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      return;
    }
    if (!timer) timer = setInterval(function () { load(); }, 2500);
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

function paintBrief(text) {
  const root = document.getElementById("brief");
  if (!root) return;
  root.replaceChildren();
  const pre = el("pre");
  pre.textContent = text || "";
  root.appendChild(pre);
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
      root.replaceChildren();
      const pre = el("pre");
      pre.textContent =
        body && body.ok && body.artifact
          ? String(body.artifact.body || "")
          : (body && body.reason) || "live artifacts stay on the laptop";
      root.appendChild(pre);
    })
    .catch((err) => {
      root.replaceChildren();
      const pre = el("pre");
      pre.textContent = String(err);
      root.appendChild(pre);
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
      .then((t) => {
        if (t && t.exec) {
          show("policy", "refused: today must not grow a runtime");
          return false;
        }
        show("policy", (t && t.reason) || "standing brief; Act stays on the laptop");
        paintBrief((t && (t.deliverable || t.brief)) || "");
        paintEvents((t && (t.events || t.today)) || []);
        return !(t && t.localFirst);
      });
  });
}

function paintLiveRoom(pageId, apiPath, cueId, refuse) {
  const page = document.getElementById(pageId);
  if (!page) return;
  pollWhileLive(function () {
    return fetch(apiPath)
      .then((r) => r.json())
      .then((m) => {
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
                : "Review: ";
          cue.textContent = text ? prefix + text : "";
        }
        page.replaceChildren();
        paintTeachMap(page, (m && m.markers) || []);
        const pre = el("pre");
        pre.textContent = (m && m.deliverable) || "";
        page.appendChild(pre);
        return !(m && m.localFirst);
      });
  });
}

paintLiveRoom("meeting-brief", "/api/meeting", "meeting-cue-web", "refused: meeting must not grow a runtime");
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
    const box = el("div", "teach-map-box");
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
      const prefix = id === "teach" ? "Next: " : id === "meeting" ? "Say this: " : id === "today" ? "" : "Review: ";
      cue.textContent = prefix + cueText;
    } else {
      cue.textContent = localFirst ? "Live " + id + " stays on the laptop." : "No live " + id + " yet.";
    }
    const pre = el("pre");
    pre.textContent = String(r.deliverable || "").slice(0, 400);
    card.appendChild(h);
    card.appendChild(cue);
    card.appendChild(pre);
    root.appendChild(card);
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
