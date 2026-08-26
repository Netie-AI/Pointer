fetch("/api/state")
  .then((r) => r.json())
  .then((s) => {
    const el = document.getElementById("state");
    if (!el) return;
    if (s && s.localFirst) {
      el.textContent =
        (s.reason || "live lanes stay on the laptop") +
        "\nOpen " +
        (s.coordinator || "http://127.0.0.1:18010") +
        " while Pointer is running.\n\n" +
        JSON.stringify(s, null, 2);
      return;
    }
    el.textContent = JSON.stringify(s, null, 2);
  })
  .catch((err) => {
    const el = document.getElementById("state");
    if (el) el.textContent = String(err);
  });
