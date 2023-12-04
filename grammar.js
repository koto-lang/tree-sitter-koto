/// <reference types="tree-sitter-cli/dsl" />

module.exports = grammar({
  name: 'koto',

  extras: $ => [
    $.comment,
    /\s/,
  ],

  word: $ => $.identifier,

  rules: {
    source_file: $ => repeat($._expressions),

    _expressions: $ => list_of($._expression, ','),

    _expression: $ => seq(
      optional('-'),
      choice(
        $.boolean,
        $.null,
        $.number,
        $.string,
        $.identifier,
        $.parenthesized_expression,
      ),
    ),

    boolean: _ => choice('true', 'false'),

    comment: _ => token(choice(
      // Single-line comment
      /#.*/,
      // Multi-line comment
      seq('#-', repeat(choice(/./, /\s/)), '-#'),
    )),

    identifier: _ => /[\p{XID_Start}_][\p{XID_Continue}]*/u,

    null: _ => 'null',

    number: _ => token(
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
    ),
    
    parenthesized_expression: $ => seq('(', $._expressions, ')'),

    string: $ => choice(
      string($, '\''),
      string($, '\"'),
    ),
  }
});

function string($, quote) {
  return seq(
    quote,
    repeat(choice(
      seq('$', $.identifier),
      seq('${', $._expressions, '}'),
      /./,
      /\s/
    )),
    quote);
}

function any_amount_of() {
  return repeat(seq(...arguments));
}

function one_or_more() {
  return repeat1(seq(...arguments));
}

function list_of(match, sep, trailing) {
  return trailing
    ? seq(match, any_amount_of(sep, match), optional(sep))
    : seq(match, any_amount_of(sep, match));
}
