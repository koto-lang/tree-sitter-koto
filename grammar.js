/// <reference types="tree-sitter-cli/dsl" />

const PREC = {
  not: 1,
  pipe: 2,
  range: 3,
  assign: 4,
  modifyAssign: 5,
  or: 6,
  and: 7,
  equality: 8,
  comparison: 9,
  add: 10,
  multiply: 11,
  unary: 12,
  negate: 13,
};

module.exports = grammar({
  name: 'koto',

  extras: $ => [
    $.comment,
    /[ \t]/,
  ],

  externals: $ => [
    $._newline,
    $._continuation,
    $.error_sentinel,
  ],

  conflicts: $ => [
    [$.binary_op, $.comparison_op, $.boolean_op],
  ],

  word: $ => $.identifier,

  rules: {
    module: $ => seq(
      repeat($._newline),
      repeat(
        seq(
          $._expressions,
          repeat($._newline),
        )
      ),
    ),

    _expressions: $ => list_of($._expression, ','),

    // comma-separated expressions with flexible newline rules
    _contained_expressions: $ => seq(
      repeat($._newline),
      $._expression,
      repeat(
        seq(
          repeat($._newline),
          ',',
          repeat($._newline),
          $._expression,
        )
      ),
      optional(','),
      repeat($._newline),
    ),

    _expression: $ => choice(
      $.boolean,
      $.null,
      $.number,
      $.string,
      $.identifier,
      $.tuple,
      $.list,
      $._unary_op,
      $.binary_op,
      $.comparison_op,
      $.boolean_op,
    ),

    _unary_op: $ => choice(
      $.not,
      $.negate,
    ),

    binary_op: $ => choice(
      binary_op($, '-', prec.left, PREC.add),
      binary_op($, '+', prec.left, PREC.add),
      binary_op($, '*', prec.left, PREC.multiply),
      binary_op($, '/', prec.left, PREC.multiply),
      binary_op($, '%', prec.left, PREC.multiply),
    ),

    comparison_op: $ => choice(
      binary_op($, '!=', prec.right, PREC.comparison),
      binary_op($, '==', prec.right, PREC.comparison),
      binary_op($, '>', prec.right, PREC.comparison),
      binary_op($, '>=', prec.right, PREC.comparison),
      binary_op($, '<', prec.right, PREC.comparison),
      binary_op($, '<=', prec.right, PREC.comparison),
    ),

    boolean_op: $ => choice(
      binary_op($, 'and', prec.right, PREC.and),
      binary_op($, 'or', prec.right, PREC.or),
    ),

    boolean: _ => choice('true', 'false'),

    comment: _ => token(choice(
      /#.*/, // Single-line comment
      seq('#-', repeat(choice(/./, /\s/)), '-#'), // Multi-line comment
    )),

    identifier: _ => /[\p{XID_Start}_][\p{XID_Continue}]*/u,

    negate: $ => prec(PREC.negate, (seq('-', $._expression))),
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

    tuple: $ => choice(
      seq('(', optional(','), ')'),
      seq('(', $._contained_expressions, ')'),
    ),

    list: $ => choice(
      seq('[', optional(','), ']'),
      seq('[', $._contained_expressions, ']'),
    ),

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

function binary_op($, operator, precedence_fn, precedence) {
  return precedence_fn(precedence, seq(
    $._expression,
    repeat($._continuation),
    operator,
    repeat($._continuation),
    $._expression
  ));
}
