const listEl = document.getElementById("list");
const viewEl = document.getElementById("view");
const metaEl = document.getElementById("meta");

let filter = "today";
let items = [];
let activeId = null;

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Tiny markdown → HTML (headings, fences, quotes, hr, paragraphs). */
function mdToHtml(src) {
  const lines = String(src || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inFence = false;
  let fence = [];
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${esc(para.join(" ")).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`);
    para = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inFence) {
        out.push(`<pre><code>${esc(fence.join("\n"))}</code></pre>`);
        fence = [];
        inFence = false;
      } else {
        flushPara();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fence.push(line);
      continue;
    }
    if (/^#{1,3}\s/.test(line)) {
      flushPara();
      const level = line.match(/^#+/)[0].length;
      out.push(`<h${level}>${esc(line.replace(/^#+\s*/, ""))}</h${level}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara();
      out.push(`<blockquote>${esc(line.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushPara();
      out.push("<hr/>");
      continue;
    }
    if (!line.trim()) {
      flushPara();
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  if (inFence && fence.length) out.push(`<pre><code>${esc(fence.join("\n"))}</code></pre>`);
  return out.join("\n");
}

function renderList() {
  listEl.innerHTML = "";
  if (!items.length) {
    listEl.innerHTML = `<div class="empty">No files for this filter.</div>`;
    return;
  }
  for (const it of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item" + (it.id === activeId ? " active" : "");
    btn.innerHTML = `<span class="t">${esc(it.title || it.id)}${
      it.kind ? `<span class="pill">${esc(it.kind)}</span>` : ""
    }</span><span class="m">${esc(it.airgpt_id || "")} · ${esc((it.saved_at || "").slice(0, 19))}</span>`;
    btn.addEventListener("click", () => openItem(it));
    listEl.appendChild(btn);
  }
}

async function openItem(it) {
  activeId = it.id;
  renderList();
  metaEl.textContent = `${it.title || it.id} · ${it.airgpt_id || ""}`;
  const res = await window.netieCanvas.invoke("canvas:read", { id: it.id, source: it.source });
  if (!res || !res.ok) {
    viewEl.innerHTML = `<div class="empty">${esc((res && res.error) || "Could not read")}</div>`;
    return;
  }
  viewEl.innerHTML = mdToHtml(res.markdown);
}

async function refresh() {
  const res = await window.netieCanvas.invoke("canvas:list", { filter });
  items = (res && res.items) || [];
  renderList();
  if (items[0] && !activeId) openItem(items[0]);
}

document.querySelectorAll(".filters button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".filters button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    filter = b.getAttribute("data-filter");
    activeId = null;
    refresh();
  });
});

document.getElementById("btn-refresh").addEventListener("click", refresh);
document.getElementById("btn-folder").addEventListener("click", () => {
  window.netieCanvas.invoke("canvas:openFolder", { filter });
});

window.netieCanvas.invoke("canvas:ready").then(refresh);
