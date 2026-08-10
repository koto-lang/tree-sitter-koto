generate:
  npx tree-sitter generate --abi 14

highlight *ARGS:
  npx tree-sitter highlight {{ARGS}}

test *ARGS:
  npx tree-sitter test {{ARGS}}

watch COMMAND *ARGS:
  watchexec -w grammar.js -w test -w queries -w src/scanner.c "just {{COMMAND}} {{ARGS}}"
