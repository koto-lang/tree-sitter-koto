/// <reference types="tree-sitter-cli/dsl" />

const PREC = {
  comma: -1,
  chain: 2,
  range: 7,
  assign: 12,
  or: 14,
  and: 15,
  equality: 16,
  comparison: 17,
  add: 18,
  multiply: 19,
  negate: 21,
};

const id = /[\p{XID_Start}_][\p{XID_Continue}]*/;
const meta_id = /@[\p{XID_Start}][\p{XID_Continue}]*/;

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
    $.comment,
    $._string_start,
    $._string_end,
    $._raw_string_start,
    $._raw_string_end,
    $._interpolation_start,
    $._interpolation_end,
    $.error_sentinel,
  ],

  conflicts: $ => [
    [$.assign, $.modify_assign, $.binary_op, $.comparison_op, $.boolean_op],
    [$._term, $.chain],
    [$._contained_expressions, $._index],
    [$._contained_expressions, $._contained_expressions],
  ],

  word: $ => $.identifier,

  rules: {
    module: $ => seq(
      $._block_start,
      repeat(
        seq(
          $._block_continue,
          $._block_expressions,
        )
      ),
      $._block_end,
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
      $.chain,
      $.map_block,
      $.if,
      $.switch,
      $.match,
      $.for,
      $.while,
      $.until,
      $.loop,
      $.function,
      $.return,
      $.throw,
      $.yield,
      $.break,
      $.continue,
      $.debug,
      $.import,
      $.export,
      $.try,
      $.assign,
      $.modify_assign,
      $.binary_op,
      $.comparison_op,
      $.boolean_op,
      $.range,
      $.range_inclusive,
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

    _block_expressions: $ => choice(
      $._expressions,
      $._cascade_arm,
    ),

    // Arms of if/else if/else or try/catch/finally cascades
    // Ideally these would be included in $.if and $.try, but they intefere with block
    // continuation. Parsing them separately will do for now.
    _cascade_arm: $ => choice(
      $.else_if,
      $.else,
      $.catch,
      $.finally,
    ),

    block: $ => prec.left(seq(
      $._block_start,
      $._expressions,
      repeat(
        seq(
          repeat1($._block_continue),
          $._block_expressions,
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

    chain: $ => prec.right(PREC.chain, seq(
      field('start', $._term),
      choice(
        seq(
          repeat1(choice(
            seq(
              repeat($._indented_line),
              field('lookup', seq(
                '.', choice($.identifier, $.string),
              )),
            ),
            field('call', $.tuple),
            field('index', $._index),
          )),
          optional($.call),
        ),
        $.call
      )
    )),

    _index: $ => seq(
      '[',
      choice(
        $._expression,
        $.range_from,
        $.range_to,
        $.range_to_inclusive,
        $.range_full,
      ),
      ']'
    ),

    call: $ => prec.right(PREC.chain, seq(
      repeat($._indented_line),
      $._expression,
      repeat(seq(
        repeat($._indented_line),
        ',',
        repeat($._indented_line),
        $._expression,
      ))
    )),

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
      binary_op($, '!=', prec.left, PREC.comparison),
      binary_op($, '==', prec.left, PREC.comparison),
      binary_op($, '>', prec.left, PREC.comparison),
      binary_op($, '>=', prec.left, PREC.comparison),
      binary_op($, '<', prec.left, PREC.comparison),
      binary_op($, '<=', prec.left, PREC.comparison),
    ),

    boolean_op: $ => choice(
      binary_op($, 'and', prec.left, PREC.and),
      binary_op($, 'or', prec.left, PREC.or),
    ),

    range: $ => prec.left(PREC.range, seq(
      $._expression, '..', $._expression
    )),

    range_inclusive: $ => prec.left(PREC.range, seq(
      $._expression, '..=', $._expression
    )),

    range_from: $ => prec.left(PREC.range, seq(
      $._expression, '..'
    )),

    range_to: $ => prec.left(PREC.range, seq(
      '..', $._expression
    )),

    range_to_inclusive: $ => prec.left(PREC.range, seq(
      '..=', $._expression
    )),

    range_full: _ => '..',

    break: _ => 'break',
    continue: _ => 'continue',
    false: _ => 'false',
    null: _ => 'null',
    self: _ => 'self',
    true: _ => 'true',

    identifier: _ => id,

    meta: $ => choice(
      prec.right(
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
    throw: $ => keyword_expression($, 'throw'),

    export: $ => prec.right(seq(
      'export',
      choice(
        seq(
          choice(
            $.identifier,
            $.meta,
          ),
          optional(
            seq(
              repeat($._indented_line),
              '=',
              repeat($._indented_line),
              $._expression,
            ),
          ),
        ),
        seq(
          repeat($._indented_line),
          $.map,
        ),
        $.map_block,
      ),
    )),

    number: _ => token(
      choice(
        // Ints 
        seq(/\d+/, optional(/e[+-]?\d+/)),
        // Floats 
        seq(/\d+/, '.', /\d+/, optional(/e[+-]?\d+/)),
        // Binary
        /0b[01]+/,
        // Octal
        /0o[0-7]+/,
        // Hex
        /0x[0-9a-fA-F]+/,
      ),
    ),

    tuple: $ => seq('(', optional($._contained_expressions), ')'),
    list: $ => seq('[', optional($._contained_expressions), ']'),
    _contained_expressions: $ => choice(
      seq(
        repeat($._newline),
        ',',
        repeat($._newline),
      ),
      seq(
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
        repeat($._newline),
        optional(
          ','
        ),
        repeat($._newline),
      ),
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

    map_block: $ => prec.right(seq(
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
      seq(
        $._string_start,
        repeat(choice(
          $.escape,
          seq('$', $.identifier),
          seq(
            '${',
            $._interpolation_start,
            optional($._expressions),
            $._interpolation_end,
            '}',
          ),
          /./,
          /\s/
        )),
        $._string_end,
      ),
      seq(
        $._raw_string_start,
        repeat(/./),
        $._raw_string_end,
      ),
    ),

    if: $ => choice(
      // Inline if
      prec.right(seq(
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
      prec.right(seq(
        'if',
        field('condition', $._expression),
        field('then', $.block),
      )),
    ),

    else_if: $ => seq(
      'else if',
      field('condition', $._expression),
      field('then', $.block),
    ),

    else: $ => seq(
      'else',
      $.block,
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

    _tuple_args: $ => seq('(', $._contained_args, ')'),
    _list_args: $ => seq('[', $._contained_args, ']'),
    _contained_args: $ => seq($.arg, repeat(seq(',', $.arg)), optional(',')),

    ellipsis: _ => '...',

    import: $ => prec.right(seq(
      optional(seq('from', $.import_module)),
      'import',
      $.import_item,
      repeat(seq(',', $.import_item)),
    )),

    import_module: $ => choice(
      seq(
        $.identifier,
        repeat(seq('.', $.identifier)),
      ),
      $.string,
    ),

    import_item: $ => seq(
      choice($.string, $.identifier),
      optional(seq('as', $.identifier)),
    ),

    try: $ => prec.right(seq(
      'try',
      $.block,
    )),

    catch: $ => seq(
      'catch',
      $.identifier,
      $.block,
    ),

    finally: $ => seq(
      'finally',
      $.block,
    ),

    escape: $ => seq(
      '\\',
      choice(
        // Any single non-whitespace character
        // (we don't need to list all valid escape characters)
        /\S/,
        // Newline
        /\r?\n/,
        // \x42
        /x[0-9a-fA-F]{2}/,
        // \u{123456}
        /u\{[0-9a-fA-F]{1,6}\}/,
      )
    ),
  }
});

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
  return prec.right(seq(
    keyword,
    optional(seq(repeat($._indented_line), $._expression)),
  ));
}       
