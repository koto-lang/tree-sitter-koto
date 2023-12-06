generate:
  tree-sitter generate

highlight *ARGS: generate
  tree-sitter highlight {{ARGS}}

test *ARGS: generate
  tree-sitter test {{ARGS}}

watch COMMAND *ARGS:
  watchexec -w grammar.js -w test -w queries -w src/scanner.c "just {{COMMAND}} {{ARGS}}"
