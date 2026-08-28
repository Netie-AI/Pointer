---
keywords: copy, clipboard_verify, clipboard_baseline, paste, DR-0005
main_idea: Copy and copy-all record a clipboard baseline then verify so a failed Ctrl+C cannot feed stale paste.
---

# Copy proves the clipboard changed (DR-0005)

Laptop Act "copy then paste" was a blind Ctrl+C. In a terminal that sends SIGINT, the clipboard stays stale and paste writes the wrong thing. Word-from-clipboard already had baseline+verify (#16). Bare copy did not.

Copy and copy-all now record `clipboard_baseline`, copy, wait, then `clipboard_verify`. A no-change clipboard is a visible refusal, not a successful paste of leftover text. Cortex `/dms/secure` then reviewPlan still gate.
