/// <reference types="tree-sitter-cli/dsl" />

const PREC = {
  comma: 1,
  assign: 2,
  keyword: 3,
  call: 4,
  parenthesized: 5,
  range: 6,
  or: 7,
  and: 8,
  equality: 9,
  comparison: 10,
  add: 11,
  multiply: 12,
  power: 13,
  negate: 14,
  chain: 15,
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
    $._indent,
    $._dedent,
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
    [$.module],
    [$._term, $.assign_targets],
    [$._flexi_comma],
    [$.assign_expressions],
    [$._term_ext, $._block_expression],
    [$._inline_expressions],
    [$._expressions, $.comma_separated],
    [$.comma_separated, $._inline_expression],
    [$.comma_separated],
  ],

  word: $ => $.identifier,

  rules: {
    module: $ => seq(
      repeat($._newline),
      repeat($._line_start),
      repeat($._newline),
    ),

    _line_start: $ => seq(
      choice(
        $._inline_expressions,
        $._block_expression,
      ),
    ),

    _inline_expressions: $ => seq(
      $._inline_expression,
      repeat(seq(';', $._inline_expression)),
      optional(';'),
      optional($._newline),
    ),

    _inline_expression: $ => choice(
      $._expression,
      $._control_flow,
      $.comma_separated,
    ),

    _expression: $ => choice(
      $._term_ext,
      $._assignment,
      $.call,
      $.yield,
      $.import,
      $.export,
      $.debug,
    ),

    _term_ext: $ => choice(
      $._term,
      $.range,
      $.range_inclusive,
      $.binary_op,
      $.comparison_op,
      $.boolean_op,
      $.function,
      $.chain,
      $.not,
    ),

    _term: $ => choice(
      $._constants,
      $.number,
      $.string,
      $.identifier,
      $.meta,
      $.parenthesized,
      $.tuple,
      $.list,
      $.map,
      $.negate,
    ),

    _assignment: $ => choice(
      $.assign,
      $.multi_assign,
      $.let_assign,
      $.modify_assign,
    ),

    _control_flow: $ => choice(
      $.return,
      $.throw,
      $.break,
      $.continue,
    ),

    _block_expression: $ => choice(
      $.if,
      $.switch,
      $.match,
      $.for,
      $.while,
      $.until,
      $.loop,
      $.try,
      $.function,
      $.call_indented,
    ),

    _expressions: $ => choice(
      $._expression,
      $.comma_separated,
    ),

    comma_separated: $ => seq(
      $._expression,
      repeat1(seq(
        ',',
        optional($._newline),
        $._expression,
      )),
      optional(','),
    ),

    block: $ => seq(
      $._indent,
      repeat1($._line_start),
      $._dedent,
    ),

    _line_or_block: $ => choice(
      $._inline_expressions,
      $.block,
      // Allow the expression to be left incomplete
      $._newline,
    ),

    _constants: $ => choice(
      $.self,
      $.true,
      $.false,
      $.null,
    ),

    // Chained lookup/index/call comma_separated
    // e.g. `x[0]?.foo(123)`
    chain: $ => prec(PREC.chain, seq(
      // The start of the chain
      field('start', $._term),
      // All following chain nodes
      repeat1(
        choice(
          $.null_check, // ?
          $.call_args,  // ()
          $.index,      // []
          $.lookup,     // .
        )
      ),
    )),

    // Paren-free calls
    // e.g. `f 1, 2`
    call: $ => prec.right(PREC.call, seq(
      field('function', choice(
        $.identifier,
        $.chain,
      )),
      $._call_args,
    )),

    // Paren-free calls that can have indented arguments
    // e.g.:
    //   my_fn
    //     1, 2
    call_indented: $ => prec.right(PREC.call, seq(
      field('function', choice(
        $.identifier,
        $.chain,
      )),
      seq(
        $._indent,
        $._call_args,
        $._dedent,
      ),
    )),

    // Parenthesized call args, captured in a chain
    // e.g. `f(1, 2)`
    //        ^^^^^^ call_args
    //       ^ chain start
    call_args: $ => seq(
      token.immediate('('),
      optional($._call_args),
      ')'
    ),

    _call_args: $ => prec.right(seq(
      $.call_arg,
      repeat(
        seq(
          ',',
          optional($._newline),
          $.call_arg,
        ),
      ),
    )),

    call_arg: $ => choice(
      prec.right(seq(
        $._term_ext,
        optional($.ellipsis),
      )),
      $.call,
      // Allow nested function calls in arguments with higher precedence
      prec.right(PREC.chain, $.chain),
    ),

    // Index operation, captured in a chain
    // e.g. `f[1]`
    //        ^^^ index
    //       ^ chain start
    index: $ => seq(
      token.immediate('['),
      choice(
        $._term_ext,
        $.range_from,
        $.range_to,
        $.range_to_inclusive,
        $.range_full,
      ),
      ']',
    ),

    // `.` lookup operation, captured in a chain
    // e.g. `f.x`
    //        ^^ lookup
    //       ^ chain start
    lookup: $ => prec.right(PREC.chain, seq(
      seq(
        token.immediate('.'),
        choice($.identifier, $.string),
      ),
    )),

    null_check: _ => '?',

    assign: $ => prec.right(PREC.assign, seq(
      field('lhs', $._assign_target),
      $._assign_rhs,
    )),

    multi_assign: $ => prec.right(PREC.assign, seq(
      field('lhs', $.assign_targets),
      $._assign_rhs,
    )),

    _assign_rhs: $ => prec.right(PREC.assign, seq(
      '=',
      field('rhs', choice(
        seq(
          $._indent,
          choice(
            $._expression,
            $.assign_expressions,
          ),
          $._dedent,
        ),
        choice(
          $._expression,
          $.assign_expressions,
          $.map_block,
        ),
      ))
    )),

    assign_targets: $ => seq(
      $.identifier,
      repeat1(seq(
        ',',
        $.identifier,
      ))
    ),

    _assign_target: $ => choice(
      $.identifier,
      $.meta,
      $.chain,
    ),

    assign_expressions: $ => prec(PREC.assign, seq(
      $._expression,
      repeat1(seq(
        token.immediate(','),
        optional($._newline),
        $._expression,
      )),
      // Optional trailing comma
      optional(','),
    )),

    let_assign: $ => choice(
      seq(
        'let',
        $.variable,
        repeat(seq(
          token.immediate(','),
          $.variable,
        )),
        $._assign_rhs,
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
      assign_op($, '^=', prec.right),
    ),

    binary_op: $ => choice(
      binary_op($, '-', prec.left, PREC.add),
      binary_op($, '+', prec.left, PREC.add),
      binary_op($, '*', prec.left, PREC.multiply),
      binary_op($, '/', prec.left, PREC.multiply),
      binary_op($, '%', prec.left, PREC.multiply),
      binary_op($, '^', prec.right, PREC.power),
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
      $._term_ext, '..', $._term_ext
    )),

    range_inclusive: $ => prec.left(PREC.range, seq(
      $._term_ext, '..=', $._term_ext
    )),

    range_from: $ => prec.left(PREC.range, seq(
      $._term_ext, '..'
    )),

    range_to: $ => prec.left(PREC.range, seq(
      '..', $._term_ext
    )),

    range_to_inclusive: $ => prec.left(PREC.range, seq(
      '..=', $._term_ext
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
      '@^',
      '@+=',
      '@-=',
      '@*=',
      '@/=',
      '@%=',
      '@^=',
      '@==',
      '@!=',
      '@>',
      '@>=',
      '@<',
      '@<=',
    ),

    negate: $ => prec(PREC.negate, seq('-', choice($._term, $.chain))),

    not: $ => keyword_expression_single($, 'not'),

    debug: $ => keyword_expression_multi($, 'debug', PREC.keyword),
    return: $ => keyword_expression_multi($, 'return', PREC.keyword),
    yield: $ => keyword_expression_multi($, 'yield', PREC.keyword),
    throw: $ => keyword_expression_multi($, 'throw', PREC.keyword),

    export: $ => prec.right(seq(
      'export',
      choice(
        $._expressions,
        $.map_block,
      ),
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

    parenthesized: $ => prec(PREC.parenthesized, seq('(', $._expression, ')')),

    tuple: $ => prec(PREC.parenthesized, seq(
      '(',
      optional($._newline),
      optional(choice(
        // Just a comma
        $._flexi_comma,
        // At least one element, with at least one comma, e.g. `(x,)`, `(x, y)`
        seq(
          $.element,
          $._flexi_comma,
          optional(seq(
            $.element,
            repeat(
              seq(
                $._flexi_comma,
                $.element,
              )
            ),
            optional($._flexi_comma),
          )),
        ),
      )),
      optional($._newline),
      ')',
    )),

    list: $ => prec(PREC.parenthesized, seq(
      '[',
      optional($._newline),
      optional(choice(
        // just a comma
        $._flexi_comma,
        // At least one element, with optional trailing comma
        seq(
          $.element,
          repeat(
            seq(
              $._flexi_comma,
              $.element,
            )
          ),
          optional($._flexi_comma),
        ),
      )),
      optional($._newline),
      ']',
    )),

    _flexi_comma: $ => seq(
      repeat($._newline),
      token.immediate(','),
      repeat($._newline),
    ),

    element: $ => $._term_ext,

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

    map_block: $ => seq(
      $._indent,
      repeat1($.entry_block),
      $._dedent,
    ),

    entry_block: $ => seq(
      field('key', $._map_key),
      ':',
      field('value', choice(
        $._line_or_block,
        $.map_block,
      )),
    ),

    _map_key: $ => choice(
      $.identifier,
      $.meta,
      $.string,
    ),

    string: $ => choice(
      seq(
        $._string_start,
        optional($.string_content),
        $._string_end,
      ),
      seq(
        $._raw_string_start,
        optional($.raw_string_content),
        $._raw_string_end,
      ),
    ),

    string_content: $ => repeat1(
      choice(
        $.escape,
        $.interpolation,
        /./,
        /\s/
      )
    ),

    raw_string_content: $ => repeat1(/./),

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

    if: $ => prec.right(seq(
      'if',
      field('condition', $._expression),
      choice(
        seq(
          'then',
          field('then', $._expression),
          optional(
            seq(
              'else',
              field('else', $._expression),
            )
          ),
          $._newline,
        ),
        seq(
          field('then', $.block),
          repeat($.else_if),
          optional($.else),
        ),
        $._newline,
      ),
    )),

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
      $._indent,
      repeat1($.switch_arm),
      optional($.switch_else),
      $._dedent,
    ),

    switch_arm: $ => seq(
      field('condition', $._expression),
      'then',
      field('then', $._line_or_block),
    ),

    switch_else: $ => seq(
      'else',
      $._line_or_block,
    ),

    match: $ => seq(
      'match',
      seq($.match_conditions,
        choice(
          seq($._indent,
            repeat1($.match_arm),
            optional($.match_else),
            $._dedent,
          ),
          $._newline,
        ),
      ),
    ),

    match_conditions: $ => prec.right(seq(
      $._term_ext,
      repeat(seq(
        ',',
        $._term_ext
      ))
    )),

    match_arm: $ => seq(
      $.match_patterns,
      optional(field('condition', seq(
        'if',
        $._term_ext,
      ))),
      'then',
      field('then', $._line_or_block),
    ),

    match_else: $ => seq(
      'else',
      $._line_or_block,
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

    for: $ => seq(
      'for',
      field('args', $.for_args),
      'in',
      field('range', $._expression),
      field('body', $._line_or_block),
    ),

    for_args: $ => seq(
      $.variable,
      repeat(
        seq(
          ',',
          $.variable,
        )
      ),
    ),

    until: $ => seq(
      'until',
      field('condition', $._expression),
      field('body', $._line_or_block),
    ),

    while: $ => seq(
      'while',
      field('condition', $._expression),
      field('body', $._line_or_block),
    ),

    loop: $ => prec.right(seq(
      'loop',
      field('body', $._line_or_block),
    )),

    function: $ => seq(
      $.args,
      optional(seq(
        '->',
        $.type
      )),
      field('body', $._line_or_block),
    ),

    args: $ => seq(
      "|",
      optional(seq(
        $.arg,
        repeat(
          seq(',', $.arg),
        ),
        optional(','),
      )),
      // Use token.immediate to avoid confusing the closing | as the start of a new function
      token.immediate("|"),
    ),

    arg: $ => choice(
      seq($.variable, optional($.default)),
      $.ellipsis,
      seq($.ellipsis, $.identifier),
      seq($.identifier, $.ellipsis),
      seq(alias($._tuple_args, $.tuple), optional($.default)),
      seq(alias($._list_args, $.list), optional($.default)),
    ),

    default: $ => seq(
      '=',
      $._term_ext,
    ),

    _tuple_args: $ => seq('(', $._contained_args, ')'),
    _list_args: $ => seq('[', $._contained_args, ']'),
    _contained_args: $ => seq(
      $.arg,
      repeat(seq(
        token.immediate(','),
        $.arg,
      )),
      optional(',')
    ),

    ellipsis: _ => '...',

    import: $ => prec.right(seq(
      optional(seq('from', $.import_module)),
      'import',
      choice(
        seq(
          $.import_item,
          repeat(seq(',', $.import_item)),
        ),
        '*',
      ))),

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

    try: $ => seq(
      'try',
      $._line_or_block,
      repeat1($.catch),
      optional($.finally),
    ),

    catch: $ => seq(
      'catch',
      $.identifier,
      $._line_or_block,
    ),

    finally: $ => seq(
      'finally',
      $._line_or_block,
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
    operator,
    $._expression
  ));
}

function binary_op($, operator, precedence_fn, precedence) {
  return precedence_fn(precedence, seq(
    $._term_ext,
    choice(
      seq(
        operator,
        $._term_ext,
      ),
      seq(
        operator,
        $._indent,
        $._term_ext,
        $._dedent,
      )
    ),
  ));
}

function keyword_expression_single($, keyword) {
  return prec.right(seq(
    keyword,
    optional($._expression),
  ));
}

function keyword_expression_multi($, keyword, precedence) {
  return prec.right(precedence, seq(
    keyword,
    optional(
      choice(
        $._expressions,
        seq(
          $._indent,
          $._expressions,
          $._dedent,
        ),
        $.map_block,
      ))
  ));
}
