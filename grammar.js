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
    ),

    boolean: _ => choice('true', 'false'),

    comment: _ => token(choice(
      // Single-line comment
      /#.*/,
      // Multi-line comment
      seq('#-', repeat(choice(/./, /\s/)), '-#'),
    )),

    null: _ => 'null',
  }
});
