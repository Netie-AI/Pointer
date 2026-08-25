fetch("/api/state")
  .then((r) => r.json())
  .then((s) => {
    const el = document.getElementById("state");
    if (el) el.textContent = JSON.stringify(s, null, 2);
  })
  .catch((err) => {
    const el = document.getElementById("state");
    if (el) el.textContent = String(err);
  });
