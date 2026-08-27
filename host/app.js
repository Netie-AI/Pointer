function show(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
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

function paintArtifacts(items) {
  const root = document.getElementById("artifacts");
  if (!root) return;
  root.replaceChildren();
  if (!items || !items.length) {
    const li = el("li", "muted");
    li.textContent = "No artifacts on this host. Live briefs stay on 127.0.0.1:18010.";
    root.appendChild(li);
    return;
  }
  items.forEach((row) => {
    const li = el("li");
    li.textContent = (row.title || row.id || "untitled") + " · " + (row.desk || "desk");
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
  Promise.all([
    fetch("/api/workspace").then((r) => r.json()),
    fetch("/api/state").then((r) => r.json()).catch(() => ({})),
  ])
    .then(([ws, state]) => {
      if (ws && ws.exec) {
        show("policy", "refused: public workspace must not grow a runtime");
        return;
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
    })
    .catch((err) => show("policy", String(err)));
}
