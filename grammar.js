/// <reference types="tree-sitter-cli/dsl" />

const PREC = {
  map_block: 1,
  block: 2,
  comma: 3,
  if: 4,
  not: 5,
  pipe: 6,
  range: 7,
  assign: 8,
  or: 9,
  and: 10,
  equality: 11,
  comparison: 12,
  add: 13,
  multiply: 14,
  unary: 15,
  negate: 16,
  debug: 17,
  call: 18,
  keyword: 19,
  meta: 21,
};

const id = /[\p{XID_Start}_][\p{XID_Continue}]*/u;
const meta_id = /@[\p{XID_Start}][\p{XID_Continue}]*/u;

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
    $._map_block_start,
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

    _term: $ => choice(
      $._constants,
      $.number,
      $.string,
      $.identifier,
      $.meta,
      $.tuple,
      $.list,
      $.map,
      $.negate,
      $.not,
    ),

    _expression: $ => choice(
      $._term,
      $.map_block,
      $.if,
      $.switch,
      $.match,
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
      $.assign,
      $.modify_assign,
      $.binary_op,
      $.comparison_op,
      $.boolean_op,
    ),

    terms: $ => seq(
      $._term,
      repeat1(seq(',', $._term))
    ),

    expressions: $ => prec.left(PREC.comma, seq(
      $._expression,
      repeat1(seq(',', $._expression))
    )),

    _expressions: $ => choice(
      $._expression,
      $.expressions,
    ),

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

    meta: $ => choice(
      prec.right(PREC.meta,
        seq(
          meta_id,
          optional(field('name', $.identifier)),
        ),
      ),
      '@[]',
      '@||',
      '@+',
      '@-',
      '@*',
      '@/',
      '@%',
      '@+=',
      '@-=',
      '@*=',
      '@/=',
      '@%=',
      '@==',
      '@!=',
      '@>',
      '@>=',
      '@<',
      '@<=',
    ),

    negate: $ => prec(PREC.negate, (seq('-', $._expression))),

    debug: $ => keyword_expression($, 'debug'),
    not: $ => keyword_expression($, 'not'),
    return: $ => keyword_expression($, 'return'),
    yield: $ => keyword_expression($, 'yield'),

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

    map: $ => seq(
      '{',
      optional(seq(
        $.entry_inline,
        repeat(seq(
          ',',
          $.entry_inline,
        ))
      )),
      '}'
    ),

    entry_inline: $ => seq(
      field('key', $._map_key),
      optional(seq(
        ':',
        field('value', $._expression),
      )),
    ),

    map_block: $ => prec.right(PREC.map_block, seq(
      $._map_block_start,
      $.entry_block,
      repeat(
        seq(
          repeat1($._block_continue),
          $.entry_block,
        )
      ),
      $._block_end,
    )),

    entry_block: $ => seq(
      field('key', $._map_key),
      ':',
      field('value', $._expression),
    ),

    _map_key: $ => choice(
      $.identifier,
      $.meta,
      $.string,
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

    switch: $ => seq(
      'switch',
      $._block_start,
      choice(
        seq(
          repeat1($.switch_arm),
          optional(
            $._else_arm,
          ),
        ),
        $._else_arm,
      ),
      $._block_end,
    ),

    switch_arm: $ => seq(
      $._block_continue,
      field('condition', $._expression),
      'then',
      field('then',
        choice(
          $._expressions,
          $.block,
        ),
      )
    ),

    match: $ => seq(
      'match',
      $._expressions,
      $._block_start,
      seq(
        repeat1($.match_arm),
        optional(
          $._else_arm,
        ),
      ),
      $._block_end,
    ),

    match_arm: $ => seq(
      $._block_continue,
      $.match_patterns,
      optional(field('condition', seq(
        'if',
        $._expression,
      ))),
      'then',
      field('then',
        choice(
          $._expressions,
          $.block,
        ),
      )
    ),

    match_patterns: $ => seq(
      choice($._term, $.terms),
      repeat(seq(
        'or',
        choice($._term, $.terms),
      ))
    ),

    _else_arm: $ => seq(
      $._block_continue,
      'else',
      field('else',
        choice(
          $._expressions,
          $.block,
        )
      )
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

function keyword_expression($, keyword) {
  return prec.right(PREC.keyword, seq(
    keyword,
    optional(seq(repeat($._indented_line), $._expression)),
  ));
}       
