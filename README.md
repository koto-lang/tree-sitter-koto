# tree-sitter-koto

[Tree-sitter][tree-sitter] parser for [Koto][koto].

## Development

The [justfile][just] contains some commands that are
useful during development, in particular `just test` which will generate the
tree-sitter parser from [`grammar.js`](./grammar.js) and then run the tests
contained in [`test/corpus`](./test/corpus).

`just watch test` will re-run `just test` when files are updated.

Arguments can be passed to `just watch test`, 
e.g. `just watch test --debug -f identifiers` will generate the parser with
debug logging enabled, and then run only the `identifiers` test.

[`src/scanner.c`](./src/scanner.c) contains the [external scanner][scanner] used 
by the grammar, handling some of the more complex aspects of parsing Koto code. 
Debug logging for the scanner can be enabled via a preprocesser definition at the 
top of the file.

[koto]: https://koto.dev
[just]: https://github.com/casey/just
[tree-sitter]: https://tree-sitter.github.io
[scanner]: https://tree-sitter.github.io/tree-sitter/creating-parsers#external-scanners
