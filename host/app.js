function show(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
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

const workspaceEl = document.getElementById("workspace");
if (workspaceEl) {
  fetch("/api/workspace")
    .then((r) => r.json())
    .then((s) => {
      if (s && s.exec) {
        show("workspace", "refused: public workspace must not grow a runtime");
        return;
      }
      show("workspace", JSON.stringify(s, null, 2));
    })
    .catch((err) => show("workspace", String(err)));
}
