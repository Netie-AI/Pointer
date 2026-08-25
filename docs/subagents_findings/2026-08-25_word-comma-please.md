---
keywords: spoken-strip, comma-please, word_docx_write, classifyIntent, how-why
main_idea: ee59600 missed trailing comma before please; Go skipped spoken-strip on word:; how/why Word questions must stay ask
---

# Comma+please Word spoken-strip

After ee59600, "put hello in word, please" still took `terminal_to_word`
because `\s+please$` left the comma and `writeInWord` `$` failed.

Strip `\s*,?\s*please$` then leftover `,.!?`. Same form in
`classifyIntent` so "please word: hello" is act on Go. How/why
questions mentioning Word stay ask. add/append/insert prose uses
`word_docx_write` (intent already claimed those verbs).
