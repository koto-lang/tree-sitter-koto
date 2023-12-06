/// <reference types="tree-sitter-cli/dsl" />

const PREC = {
  not: 1,
  pipe: 2,
  range: 3,
  assign: 4,
  modifyAssign: 5,
  boolean: 6,
  equality: 7,
  comparison: 8,
  add: 9,
  multiply: 10,
  unary: 11,
  negate: 12,
};

module.exports = grammar({
  name: 'koto',

  extras: $ => [
    $.comment,
    /[ \t]/,
  ],

  externals: $ => [
    $._newline,
    $.error_sentinel,
  ],

  word: $ => $.identifier,

  rules: {
    module: $ => seq(
      repeat($._newline),
      repeat(
        seq(
          $._expressions,
          repeat1($._newline),
        )
      ),
    ),

    _expressions: $ => list_of($._expression, ','),

    _expression: $ => choice(
      $.boolean,
      $.null,
      $.number,
      $.string,
      $.identifier,
      $.parenthesized_expression,
      $.unary_op,
      $.binary_op,
    ),

    unary_op: $ => prec(PREC.unary, seq(
      choice('not', '-'),
      $._expression,
    )),

    binary_op: $ => seq(
      choice(
        ...[
          ['=', PREC.assign],
          ['+=', PREC.modifyAssign],
          ['-=', PREC.modifyAssign],
          ['/=', PREC.modifyAssign],
          ['*=', PREC.modifyAssign],
          ['%=', PREC.modifyAssign],
          ['==', PREC.equality],
          ['!=', PREC.equality],
          ['or', PREC.boolean],
          ['and', PREC.boolean],
          ['<', PREC.comparison],
          ['<=', PREC.comparison],
          ['>=', PREC.comparison],
          ['>', PREC.comparison],
          ['+', PREC.add],
          ['-', PREC.add],
          ['*', PREC.multiply],
          ['/', PREC.multiply],
          ['%', PREC.multiply],
          ['..', PREC.range],
          ['>>', PREC.pipe],
        ].map(([operator, precedence]) =>
          prec.left(precedence,
            seq($._expression, operator, $._expression),
          )
        ),
      ),
    ),

    boolean: _ => choice('true', 'false'),

    comment: _ => token(choice(
      /#.*/, // Single-line comment
      seq('#-', repeat(choice(/./, /\s/)), '-#'), // Multi-line comment
    )),

    identifier: _ => /[\p{XID_Start}_][\p{XID_Continue}]*/u,

    negate: $ => prec(PREC.negate, seq('-', $._expression)),

    not: $ => prec(PREC.not, seq('not', $._expression)),

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
