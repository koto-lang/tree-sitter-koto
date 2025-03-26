/// <reference types="tree-sitter-cli/dsl" />

const PREC = {
  comma: -2,
  assign: -1,
  keyword: 1,
  container: 2,
  range: 7,
  or: 14,
  and: 15,
  equality: 16,
  comparison: 17,
  add: 18,
  multiply: 19,
  negate: 21,
  call: 99,
  chain: 100,
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
    $._eof,
    $.error_sentinel,
  ],

  conflicts: $ => [
    [$.binary_op, $.comparison_op, $.boolean_op],
    [$._term, $.chain],
    [$._term, $._assign_target],
    [$._expression, $._assign_target],
    [$.element, $.chain],
    [$._elements, $._elements],
    [$._term],
    [$.element],
    [$.args],
    [$.assign],
    [$.assign_expressions],
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
      $._eof,
    ),

    terms: $ => prec.left(PREC.container, seq(
      $._term,
      repeat1(seq(',', $._term))
    )),

    _terms: $ => choice(
      $._term,
      $.terms,
    ),

    _expressions: $ => choice(
      $._expression,
      $.expressions,
    ),

    _block_expressions: $ => choice(
      seq($._expressions, repeat(seq(';', optional($._expressions)))),
      $._cascade_arm,
    ),

    expressions: $ => prec.left(PREC.comma, seq(
      $._expression,
      repeat1(seq(
        ',',
        repeat($._indented_line),
        $._expression,
      )),
      // Optional trailing comma
      optional(','),
    )),

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
      $.let_assign,
      $.modify_assign,
      $.binary_op,
      $.comparison_op,
      $.boolean_op,
      $.range,
      $.range_inclusive,
      $.map_block,
      $.call,
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

    call: $ => prec.right(PREC.call, seq(
      field('function', $._term),
      $._call_args,
    )),

    chain: $ => prec.right(PREC.chain, seq(
      field('start', $._term),
      repeat1(
        choice(
          $.null_check,
          field('call', $.tuple),
          field('index', seq(
            '[',
            choice(
              $._expression,
              $.range_from,
              $.range_to,
              $.range_to_inclusive,
              $.range_full,
            ),
            ']',
          )),
          seq(
            repeat($._indented_line),
            field('lookup', seq(
              '.', choice($.identifier, $.string),
            )),
          ),
        ),
      ),
      optional($._call_args),
    )),

    _call_args: $ => prec.right(seq(
      repeat($._indented_line),
      $.call_arg,
      repeat(
        seq(repeat($._indented_line),
          ',',
          repeat($._indented_line),
          $.call_arg,
        ),
      ),
    )),

    null_check: _ => '?',
    call_arg: $ => $._expression,

    assign: $ => prec.right(PREC.assign, seq(
      field('lhs', choice($._assign_target, $.assign_targets)),
      repeat($._indented_line),
      '=',
      repeat($._indented_line),
      field('rhs', optional(choice(
        seq(
          repeat($._indented_line),
          $._expression,
        ),
        $.assign_expressions,
      )))
    )),

    assign_targets: $ => seq(
      $._assign_target,
      repeat1(seq(
        ',',
        $._assign_target
      ))
    ),

    _assign_target: $ => choice(
      $.identifier,
      $.meta,
      $.chain,
    ),

    assign_expressions: $ => seq(
      repeat($._indented_line),
      $._expression,
      repeat1(seq(
        ',',
        repeat($._indented_line),
        $._expression,
      )),
      // Optional trailing comma
      optional(','),
    ),

    let_assign: $ => choice(
      seq(
        'let',
        repeat($._indented_line),
        $.variable,
        repeat(seq(
          ',',
          $.variable,
        )),
        repeat($._indented_line),
        '=',
        repeat($._indented_line),
        $._expressions,
      ),
    ),

    variable: $ => seq(
      $.identifier,
      optional(seq(
        ':',
        $.type,
      )),
    ),

    type: $ => prec.right(seq(
      $.identifier,
      optional('?'),
    )),

    modify_assign: $ => choice(
      assign_op($, '-=', prec.right),
      assign_op($, '+=', prec.right),
      assign_op($, '*=', prec.right),
      assign_op($, '/=', prec.right),
      assign_op($, '%=', prec.right),
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
    meta_id: _ => meta_id,
    test: _ => '@test',

    meta: $ => choice(
      seq(
        $.test,
        field('name', $.identifier),
      ),
      prec.right(seq(
        field('id', $.meta_id),
        optional(field('name', $.identifier)),
      )),
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

    not: $ => keyword_expression_single($, 'not'),

    debug: $ => keyword_expression_multi($, 'debug', PREC.keyword),
    return: $ => keyword_expression_multi($, 'return', PREC.keyword),
    yield: $ => keyword_expression_multi($, 'yield', PREC.keyword),
    throw: $ => keyword_expression_multi($, 'throw', PREC.keyword),

    export: $ => prec.right(seq(
      'export',
      $._expressions,
    )),

    number: _ => token(
      choice(
        // Ints
        /\d[\d_]*(e[+-]?\d[\d_]*)?/,
        // Floats
        /[\d_]*\.\d[\d_]*(e[+-]?\d[\d_]*)?/,
        // Binary
        /0b[01][01_]*/,
        // Octal
        /0o[0-7][0-7_]*/,
        // Hex
        /0x[0-9a-fA-F][0-9a-fA-F_]*/,
      ),
    ),

    tuple: $ => prec.right(PREC.container, seq('(', optional($._elements), ')')),
    list: $ => prec.right(PREC.container, seq('[', optional($._elements), ']')),
    _elements: $ => choice(
      seq(
        repeat($._newline),
        ',',
        repeat($._newline),
      ),
      seq(
        repeat($._newline),
        $.element,
        repeat(
          seq(
            repeat($._newline),
            ',',
            repeat($._newline),
            $.element,
          )
        ),
        repeat($._newline),
        optional(
          ','
        ),
        repeat($._newline),
      ),
    ),
    element: $ => $._expression,

    map: $ => seq(
      '{',
      optional(seq(
        $.entry_inline,
        repeat(seq(
          ',',
          $.entry_inline,
        )),
        optional(','),
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
          $.interpolation,
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

    interpolation: $ => seq(
      '{',
      $._interpolation_start,
      optional($._expressions),
      optional($.format),
      $._interpolation_end,
      '}',
    ),

    format: $ => seq(
      ':',
      choice(
        $.number,
        seq(
          optional($.fill_char),
          $.alignment,
          $.number,
        ),
        repeat(/./),
      )
    ),

    fill_char: $ => /./,
    alignment: $ => choice('<', '^', '>'),

    if: $ => choice(
      // Inline if
      prec.right(seq(
        'if',
        field('condition', $._expression),
        optional(seq('then',
          field('then', $._expression),
          optional(
            seq(
              'else',
              field('else', $._expression),
            )
          )
        )),
      )),
      // Multiline if
      prec.right(seq(
        'if',
        field('condition', $._expression),
        optional(field('then', $.block)),
      )),
    ),

    else_if: $ => seq(
      'else if',
      field('condition', $._expression),
      optional(field('then', $.block)),
    ),

    else: $ => seq(
      'else',
      optional($.block),
    ),

    switch: $ => prec.right(seq(
      'switch',
      optional(seq($._block_start,
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
      ))
    )),

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

    match: $ => prec.right(seq(
      'match',
      $.match_conditions,
      optional(seq(
        $._block_start,
        seq(
          repeat1($.match_arm),
          optional(
            $._else_arm,
          ),
        ),
        $._block_end
      )),
    )),

    match_conditions: $ => prec.right(seq(
      $._expression,
      repeat(seq(
        ',',
        $._expression
      ))
    )),

    match_arm: $ => seq(
      $._block_continue,
      $.match_patterns,
      optional(field('condition', seq(
        'if',
        $._expression,
      ))),
      'then',
      optional(field('then',
        choice(
          $._expressions,
          $.block,
        ),
      ))
    ),

    match_patterns: $ => seq(
      choice($._match_term, $.match_terms),
      repeat(seq(
        'or',
        choice($._match_term, $.match_terms),
      ))
    ),

    _match_term: $ => choice(
      $._constants,
      $.number,
      $.negate,
      $.string,
      $.variable,
      $.tuple,
    ),

    match_terms: $ => seq(
      $._match_term,
      repeat1(seq(',', $._match_term))
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

    for: $ => prec.right(seq(
      'for',
      field('args', $.for_args),
      'in',
      field('range', $._expression),
      optional(field('body', $.block)),
    )),

    for_args: $ => seq(
      $.variable,
      repeat(
        seq(
          ',',
          $.variable,
        )
      ),
    ),

    until: $ => prec.right(seq(
      'until',
      field('condition', $._expression),
      optional(field('body', $.block)),
    )),

    while: $ => prec.right(seq(
      'while',
      field('condition', $._expression),
      optional(field('body', $.block)),
    )),

    loop: $ => prec.right(seq(
      'loop',
      optional($.block),
    )),

    function: $ => prec.right(seq(
      $.args,
      optional(seq(
        '->',
        $.type
      )),
      optional(field('body', choice($._expressions, $.block))),
    )),

    args: $ => seq(
      "|",
      repeat($._newline),
      optional(seq(
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
      )),
      repeat($._newline),
      "|",
    ),

    arg: $ => choice(
      seq($.variable, optional($.default)),
      $.ellipsis,
      seq($.ellipsis, $.identifier),
      seq($.identifier, $.ellipsis),
      alias($._tuple_args, $.tuple),
      alias($._list_args, $.list),
    ),

    default: $ => seq(
      '=',
      $._term,
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

function assign_op($, operator, precedence_fn) {
  return precedence_fn(PREC.assign, seq(
    $._assign_target,
    repeat($._indented_line),
    operator,
    repeat($._indented_line),
    $._expression
  ));
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

function keyword_expression_single($, keyword) {
  return prec.right(seq(
    keyword,
    optional(seq(repeat($._indented_line), $._expression)),
  ));
}

function keyword_expression_multi($, keyword, precedence) {
  return prec.right(precedence, seq(
    keyword,
    optional(
      choice(
        seq(
          repeat($._indented_line),
          $._expression,
        ),
        seq(
          repeat($._indented_line),
          $._expression,
          repeat1(seq(
            ',',
            repeat($._indented_line),
            $._expression,
          )),
          // Optional trailing comma
          optional(','),
        ),
      ))
  ));
}
