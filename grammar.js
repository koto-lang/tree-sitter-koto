/// <reference types="tree-sitter-cli/dsl" />

module.exports = grammar({
  name: 'koto',

  extras: $ => [
    $.comment,
    /\s/,
  ],

  rules: {
    source_file: $ => repeat($._expression),

    _expression: $ => choice(
      $.boolean,
      $.null,
      $.number,
    ),

    boolean: _ => choice('true', 'false'),

    comment: _ => token(choice(
      // Single-line comment
      /#.*/,
      // Multi-line comment
      seq('#-', repeat(choice(/./, /\s/)), '-#'),
    )),

    null: _ => 'null',

    number: _ => token(seq(
      optional('-'),
      choice(
        // Ints / Floats
        seq(/\d+/, optional('.'), optional(/\d+/), optional(/e[+-]?\d+/)),
        // Binary
        /0b[01]+/,
        // Octal
        /0o[0-7]+/,
        // Hex
        /0x[0-9a-fA-F]+/,
      ),
    )),
  }
});
