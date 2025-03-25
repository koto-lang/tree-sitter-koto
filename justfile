generate:
  tree-sitter generate --abi 14

highlight *ARGS: generate
  tree-sitter highlight {{ARGS}}

test *ARGS: generate
  tree-sitter test {{ARGS}}

watch COMMAND *ARGS:
  watchexec -w grammar.js -w test -w queries -w src/scanner.c "just {{COMMAND}} {{ARGS}}"
