/// <reference types="tree-sitter-cli/dsl" />

const PREC = {
  map_block: 2,
  block: 3,
  comma: 4,
  if: 5,
  not: 6,
  pipe: 7,
  range: 8,
  assign: 9,
  or: 10,
  and: 11,
  equality: 12,
  comparison: 13,
  add: 14,
  multiply: 15,
  unary: 16,
  chain: 17,
  debug: 18,
  call: 19,
  negate: 20,
  keyword: 21,
  meta: 22,
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
    [$._expression, $._term],
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
      $._term,
      $.chain,
      $.meta,
      $.map_block,
      $.if,
      $.for,
      $.while,
      $.until,
      $.loop,
      $.function,
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

    _term: $ => choice(
      $._constants,
      $.number,
      $.string,
      $.identifier,
      $.tuple,
      $.list,
      $.map,
    ),

    chain: $ => prec.left(PREC.chain, seq(
      field('start', $._term),
      repeat1(
        seq(
          repeat($._indented_line),
          field('node', choice(
            $._dot_term,
            // $._term,
          ))
        )
      ),
      optional($.call)
    )),

    _dot_term: $ => seq($.dot, $._term),

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

    // Used to capture parentheses-free function calls
    call: $ => prec.left(PREC.call, seq(
      repeat($._indented_line),
      $._expression,
      repeat(seq(
        repeat($._indented_line),
        ',',
        repeat($._indented_line),
        $._expression,
      ))
    )),

    dot: _ => '.',

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

function keyword_expression($, keyword) {
  return prec.right(PREC.keyword, seq(
    keyword,
    optional(seq(repeat($._indented_line), $._expression)),
  ));
}       
