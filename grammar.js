/// <reference types="tree-sitter-cli/dsl" />

const PREC = {
  block: 1,
  comma: 2,
  if: 3,
  not: 4,
  pipe: 5,
  range: 6,
  assign: 7,
  or: 8,
  and: 9,
  equality: 10,
  comparison: 11,
  add: 12,
  multiply: 13,
  unary: 14,
  negate: 15,
  debug: 16,
  call: 17,
  return: 18,
};

const id = /[\p{XID_Start}_][\p{XID_Continue}]*/u;

module.exports = grammar({
  name: 'koto',

  extras: $ => [
    $.comment,
    /[ \t]/,
  ],

  externals: $ => [
    $._newline,
    $._block_start,
    $._block_continue,
    $._block_end,
    $._indented_line,
    $.error_sentinel,
  ],

  conflicts: $ => [
    [$.assign, $.modify_assign, $.binary_op, $.comparison_op, $.boolean_op],
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

    _expression: $ => choice(
      $._constants,
      $.number,
      $.string,
      $.identifier,
      $.meta,
      $.tuple,
      $.list,
      $.if,
      $.for,
      $.while,
      $.until,
      $.loop,
      $.function,
      $.call,
      $.return,
      $.yield,
      $.break,
      $.continue,
      $.debug,
      $._unary_op,
      $.assign,
      $.modify_assign,
      $.binary_op,
      $.comparison_op,
      $.boolean_op,
    ),

    _expressions: $ => prec.left(PREC.comma, list_of($._expression, ',')),

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

    block: $ => prec.left(PREC.block, seq(
      $._block_start,
      $._expressions,
      repeat(
        seq(
          repeat1($._block_continue),
          $._expressions,
        )
      ),
      $._block_end,
    )),

    _constants: $ => choice(
      $.self,
      $.true,
      $.false,
      $.null,
    ),

    _unary_op: $ => choice(
      $.not,
      $.negate,
    ),

    assign: $ => binary_op($, '=', prec.right, PREC.assign),

    modify_assign: $ => choice(
      binary_op($, '-=', prec.right, PREC.assign),
      binary_op($, '+=', prec.right, PREC.assign),
      binary_op($, '*=', prec.right, PREC.assign),
      binary_op($, '/=', prec.right, PREC.assign),
      binary_op($, '%=', prec.right, PREC.assign),
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

    break: _ => 'break',
    continue: _ => 'continue',
    false: _ => 'false',
    null: _ => 'null',
    self: _ => 'self',
    true: _ => 'true',

    comment: _ => token(choice(
      /#.*/, // Single-line comment
      seq('#-', repeat(choice(/./, /\s/)), '-#'), // Multi-line comment
    )),

    identifier: _ => id,
    meta: $ => token(seq('@', id)),

    debug: $ => prec(PREC.debug, seq('debug', $._expression)),
    negate: $ => prec(PREC.negate, (seq('-', $._expression))),
    not: $ => prec(PREC.not, seq('not', $._expression)),

    return: $ => prec.right(PREC.return, seq(
      'return',
      optional($._expression),
    )),

    yield: $ => seq(
      'yield',
      $._expression,
    ),

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

    call: $ => prec.right(PREC.call, seq(
      field('name', $.identifier),
      repeat($._indented_line),
      field('arg', $._expression),
      repeat(seq(
        repeat($._indented_line),
        ',',
        repeat($._indented_line),
        field('arg', $._expression),
      ))
    )),

    if: $ => choice(
      // Inline if
      prec.right(PREC.if, seq(
        'if',
        field('condition', $._expression),
        'then',
        field('then', $._expression),
        optional(
          seq(
            'else',
            field('else', $._expression),
          )
        )
      )),
      // Multiline if
      prec.right(PREC.if, seq(
        'if',
        field('condition', $._expression),
        field('then', $.block),
        repeat(
          field('else_if', seq(
            $._block_continue,
            'else if',
            field('else_if_condition', $._expression),
            field('else_if_then', $.block),
          )),
        ),
        optional(
          seq(
            $._block_continue,
            'else',
            field('else', $.block),
          )
        ),
      )),
    ),

    for: $ => seq(
      'for',
      field('args', $.for_args),
      'in',
      field('range', $._expression),
      field('body', $.block),
    ),

    for_args: $ => seq(
      $.identifier,
      repeat(
        seq(
          ',',
          $.identifier,
        )
      ),
    ),

    until: $ => seq(
      'until',
      field('condition', $._expression),
      field('body', $.block),
    ),

    while: $ => seq(
      'while',
      field('condition', $._expression),
      field('body', $.block),
    ),

    loop: $ => seq(
      'loop',
      $.block,
    ),

    function: $ => seq(
      '|',
      optional($.args),
      '|',
      field('body', choice($._expressions, $.block)),
    ),

    args: $ => seq(
      repeat($._newline),
      $.arg,
      repeat(
        seq(
          repeat($._newline),
          ',',
          repeat($._newline),
          $.arg,
        ),
      ),
      optional(','),
      repeat($._newline),
    ),

    arg: $ => choice(
      $.identifier,
      $.ellipsis,
      seq($.ellipsis, $.identifier),
      seq($.identifier, $.ellipsis),
      alias($._tuple_args, $.tuple),
      alias($._list_args, $.list),
    ),

    _tuple_args: $ => seq('(', list_of($.arg, ','), ')'),
    _list_args: $ => seq('[', list_of($.arg, ','), ']'),

    ellipsis: _ => '...',
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
    repeat($._indented_line),
    operator,
    repeat($._indented_line),
    $._expression
  ));
}
