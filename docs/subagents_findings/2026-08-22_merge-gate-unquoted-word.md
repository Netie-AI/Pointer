---
keywords: merge-gate, word_write_text, unquoted, lastWordDocx, driver.dryRun
main_idea: #30+#31 conflict on STATUS/CHANGELOG; unquoted write-in-Word missed the write verb; ipc pin must slice to lastWordDocx assignment
---

# Merge-gate and unquoted write-in-Word

PR #30 and #31 are both green alone. Merge them in that order, keep both
CHANGELOG heads, rewrite STATUS. Do not attach to #26.

"write hello in Word" without quotes is the coworkerist phrasing. Quoted /
that-says / word: already matched; put+prose used to take clipboard.
Deictic this/that/it stays clipboard.

The 4d57438 CI fail: pin sliced to the first sendWordDocxReady, so
!outcome.dryRun above that slice was invisible. Pin the assignment block.
