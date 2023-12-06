generate:
  tree-sitter generate

test *ARGS: generate
  tree-sitter test {{ARGS}}

watch COMMAND *ARGS:
  watchexec -w grammar.js -w test -w src/scanner.c "just {{COMMAND}} {{ARGS}}"
