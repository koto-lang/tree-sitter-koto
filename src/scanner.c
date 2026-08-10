#include "tree_sitter/parser.h"

#include <string.h>

// Enable debug logging and assertions by setting the following line to `#if 0`
#if 1
#define printf(...)
#define assert(...)
#else
#include <assert.h>
#include <stdio.h>
#endif

enum TokenType {
  NEWLINE,
  INDENT,
  DEDENT,
  PLAIN_COMMENT,
  STRING_START,
  STRING_END,
  RAW_STRING_START,
  RAW_STRING_END,
  INTERPOLATION_START,
  INTERPOLATION_END,
  OPERATOR_CONTINUATION_ADD,
  OPERATOR_CONTINUATION_MULTIPLY,
  OPERATOR_CONTINUATION_POWER,
  OPERATOR_CONTINUATION_COMPARISON,
  TAGGED_LINE_COMMENT_START,
  TAGGED_LINE_COMMENT_CONTENT,
  TAGGED_COMMENT_START,
  TAGGED_COMMENT_INLINE_CONTENT,
  TAGGED_COMMENT_MULTILINE_CONTENT,
  ERROR_SENTINEL,
};

#define MAX(a, b) ((a) > (b) ? (a) : (b))

#define VEC_RESIZE(vec, _cap)                                                            \
  void* tmp = realloc((vec).data, (_cap) * sizeof((vec).data[0]));                       \
  assert(tmp != NULL);                                                                   \
  (vec).data = tmp;                                                                      \
  (vec).cap = (_cap);

#define VEC_GROW(vec, _cap)                                                              \
  if ((vec).cap < (_cap)) {                                                              \
    VEC_RESIZE((vec), (_cap));                                                           \
  }

#define VEC_PUSH(vec, el)                                                                \
  if ((vec).cap == (vec).len) {                                                          \
    VEC_RESIZE((vec), MAX(16, (vec).len * 2));                                           \
  }                                                                                      \
  (vec).data[(vec).len++] = (el);

#define VEC_POP(vec) (vec).len--;

#define VEC_SIZE(vec) (vec).len

#define VEC_BACK(vec) ((vec).data[(vec).len - 1])

#define VEC_FREE(vec)                                                                    \
  if ((vec).data != NULL) {                                                              \
    free((vec).data);                                                                    \
    (vec).data = NULL;                                                                   \
  }

#define VEC_CLEAR(vec) (vec).len = 0;

static inline void advance(TSLexer* lexer) {
  lexer->advance(lexer, false);
}

static inline void skip(TSLexer* lexer) {
  lexer->advance(lexer, true);
}

typedef struct {
  uint32_t len;
  uint32_t cap;
  uint16_t* data;
} IndentVec;

typedef struct {
  uint32_t len;
  uint32_t cap;
  char* data;
} QuoteVec;

typedef struct {
  // Keeping track of the block indent levels
  IndentVec indents;
  // Keeping track of the quote type used for the current string
  QuoteVec quotes;
  // We need to block comments from being accepted while a string is being parsed.
  // interpolated strings are parsed from grammar.js, and without disabling comments,
  // "#" would be parsed as a string containing a comment rather than simply a string.
  // Additionally, we need a separate flag rather than checking whether or not the quotes
  // is empty; during an interpolated expression we're within quotes, while parsing
  // non-string expressions.
  bool in_string;
  uint8_t raw_string_hash_count;
} Scanner;

static void initialize_scanner(Scanner* scanner) {
  VEC_CLEAR(scanner->indents);
  VEC_CLEAR(scanner->quotes);
  scanner->in_string = false;
  scanner->raw_string_hash_count = 0;
}

static void skip_whitespace(TSLexer* lexer) {
  printf("skipping whitespace\n");
  while (true) {
    uint32_t next = lexer->lookahead;
    if (next != ' ' && next != '\t') {
      printf("...stopping (%u (%c))\n", next, next);
      break;
    }
    printf("...skipping (%u)\n", next);
    skip(lexer);
  }
}

static void consume_multiline_comment(TSLexer* lexer) {
  while (true) {
    switch (lexer->lookahead) {
    case '-':
      advance(lexer);
      if (lexer->lookahead == '#') {
        advance(lexer);
        return;
      }
      break;
    case '\0':
      return;
    default:
      advance(lexer);
    }
  }
}

static bool scan_comment(
    TSLexer* lexer,
    const bool* valid_symbols,
    bool at_line_start) {
  if (lexer->lookahead != '#') {
    return false;
  }

  advance(lexer);

  if (lexer->lookahead == '[') {
    if (valid_symbols[TAGGED_LINE_COMMENT_START]) {
      advance(lexer);
      lexer->mark_end(lexer);
      lexer->result_symbol = TAGGED_LINE_COMMENT_START;
      return true;
    }

    // `#[` is reserved for structured tagged line comments. In positions
    // where one isn't valid, don't discard its tag semantics as a plain
    // comment.
    return false;
  } else if (lexer->lookahead == '-') {
    advance(lexer);

    if (lexer->lookahead == '[') {
      if (valid_symbols[TAGGED_COMMENT_START] && at_line_start) {
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = TAGGED_COMMENT_START;
        return true;
      }

      // `#-[` is reserved for structured tagged comments. In positions where
      // a tagged comment isn't valid, don't silently accept it as a plain
      // block comment and discard its tag semantics.
      return false;
    }

    if (valid_symbols[PLAIN_COMMENT]) {
      consume_multiline_comment(lexer);
      lexer->mark_end(lexer);
      lexer->result_symbol = PLAIN_COMMENT;
      return true;
    }
  } else if (valid_symbols[PLAIN_COMMENT]) {
    while (!lexer->eof(lexer) && lexer->lookahead != '\n') {
      advance(lexer);
    }
    lexer->mark_end(lexer);
    lexer->result_symbol = PLAIN_COMMENT;
    return true;
  }

  return false;
}

static bool scan_tagged_line_comment_content(TSLexer* lexer) {
  if (lexer->eof(lexer) || lexer->lookahead == '\r' || lexer->lookahead == '\n') {
    return false;
  }

  bool has_content = false;

  while (!lexer->eof(lexer)) {
    if (lexer->lookahead == '\r' || lexer->lookahead == '\n') {
      break;
    }

    advance(lexer);
    lexer->mark_end(lexer);
    has_content = true;
  }

  lexer->result_symbol = TAGGED_LINE_COMMENT_CONTENT;
  return has_content;
}

static bool scan_tagged_comment_content(TSLexer* lexer, bool multiline) {
  bool has_content = false;

  if (multiline) {
    if (lexer->lookahead == '\r') {
      advance(lexer);
      if (lexer->lookahead != '\n') {
        return false;
      }
    } else if (lexer->lookahead != '\n') {
      return false;
    }

    advance(lexer);
    lexer->mark_end(lexer);
    has_content = true;
  } else if (lexer->lookahead == '\r' || lexer->lookahead == '\n') {
    return false;
  }

  while (!lexer->eof(lexer)) {
    if (!multiline && (lexer->lookahead == '\r' || lexer->lookahead == '\n')) {
      return false;
    }

    if (lexer->lookahead == '-') {
      advance(lexer);
      if (lexer->lookahead == '#') {
        if (!has_content) {
          return false;
        }
        lexer->result_symbol = multiline ? TAGGED_COMMENT_MULTILINE_CONTENT
                                         : TAGGED_COMMENT_INLINE_CONTENT;
        return true;
      }
      has_content = true;
      lexer->mark_end(lexer);
    } else {
      advance(lexer);
      has_content = true;
      lexer->mark_end(lexer);
    }
  }

  if (has_content) {
    lexer->result_symbol = multiline ? TAGGED_COMMENT_MULTILINE_CONTENT
                                     : TAGGED_COMMENT_INLINE_CONTENT;
    return true;
  }

  return false;
}

static bool accept_operator_continuation(TSLexer* lexer, enum TokenType symbol) {
  lexer->result_symbol = symbol;
  lexer->mark_end(lexer);
  return true;
}

static bool scan_operator_continuation(TSLexer* lexer, const bool* valid_symbols) {
  switch (lexer->lookahead) {
  case '-':
  case '+':
    if (valid_symbols[OPERATOR_CONTINUATION_ADD]) {
      return accept_operator_continuation(lexer, OPERATOR_CONTINUATION_ADD);
    }
    break;
  case '*':
  case '/':
  case '%':
    if (valid_symbols[OPERATOR_CONTINUATION_MULTIPLY]) {
      return accept_operator_continuation(lexer, OPERATOR_CONTINUATION_MULTIPLY);
    }
    break;
  case '^':
    if (valid_symbols[OPERATOR_CONTINUATION_POWER]) {
      return accept_operator_continuation(lexer, OPERATOR_CONTINUATION_POWER);
    }
    break;
  case '!':
  case '=':
  case '>':
  case '<':
    if (valid_symbols[OPERATOR_CONTINUATION_COMPARISON]) {
      return accept_operator_continuation(lexer, OPERATOR_CONTINUATION_COMPARISON);
    }
    break;
  }

  return false;
}

bool tree_sitter_koto_external_scanner_scan(
    void* payload,
    TSLexer* lexer,
    const bool* valid_symbols) {
  printf(
      "scanner.scan: column: %u, lookahead: %i (%c)\n",
      lexer->get_column(lexer),
      lexer->lookahead,
      (char)lexer->lookahead);
  Scanner* scanner = (Scanner*)payload;

  printf("scanner.scan valid symbols:");
  for (int i = 0; i <= ERROR_SENTINEL; i++) {
    printf(" %u", valid_symbols[i]);
  }
  printf("\n");

  const bool error_recovery = valid_symbols[ERROR_SENTINEL];
  const uint16_t current_indent =
      VEC_SIZE(scanner->indents) > 0 ? VEC_BACK(scanner->indents) : 0;
  const bool at_line_start = lexer->get_column(lexer) == current_indent;

  // Mark the end before doing anything else to allow lookahead to work correctly
  lexer->mark_end(lexer);

  // Tagged comment content is consumed verbatim, including leading whitespace.
  // Handle it before the scanner's normal whitespace skipping and before any
  // other external tokens can interpret its contents.
  if (!error_recovery) {
    if (valid_symbols[TAGGED_LINE_COMMENT_CONTENT]
        && scan_tagged_line_comment_content(lexer)) {
      return true;
    }

    if (valid_symbols[TAGGED_COMMENT_MULTILINE_CONTENT]
        && (lexer->lookahead == '\r' || lexer->lookahead == '\n')) {
      return scan_tagged_comment_content(lexer, true);
    }

    if (valid_symbols[TAGGED_COMMENT_INLINE_CONTENT]) {
      return scan_tagged_comment_content(lexer, false);
    }
  }

  // Skip any initial whitespace
  skip_whitespace(lexer);

  char next = lexer->lookahead;

  if (error_recovery) {
    printf("scanner.scan: in error recovery\n");
  }

  // String start/end detection
  if (valid_symbols[RAW_STRING_START] && !scanner->in_string && next == 'r') {
    advance(lexer);
    uint8_t hash_count = 0;
    while (lexer->lookahead == '#') {
      if (hash_count == 255) {
        printf("scanner.scan: reached raw string hash limit\n");
        return false;
      }
      hash_count++;
      advance(lexer);
    }
    next = lexer->lookahead;
    if (next == '"' || next == '\'') {
      printf(">>>> raw string start\n");
      advance(lexer);
      VEC_PUSH(scanner->quotes, next);
      scanner->in_string = true;
      scanner->raw_string_hash_count = hash_count;
      lexer->mark_end(lexer);
      lexer->result_symbol = RAW_STRING_START;
      return true;
    } else {
      printf("scanner.scan: rejected raw string start\n");
      return false;
    }
  } else if (
      valid_symbols[RAW_STRING_END] && scanner->in_string
      && next == VEC_BACK(scanner->quotes)) {
    printf(">>>> raw string end\n");
    advance(lexer);
    uint8_t hash_count = 0;
    while (lexer->lookahead == '#') {
      if (hash_count == 255) {
        break;
      }
      hash_count++;
      advance(lexer);
    }
    if (hash_count != scanner->raw_string_hash_count) {
      printf("scanner.scan: rejected raw string end\n");
      return false;
    }
    VEC_POP(scanner->quotes);
    scanner->in_string = false;
    scanner->raw_string_hash_count = 0;
    lexer->mark_end(lexer);
    lexer->result_symbol = RAW_STRING_END;
    return true;
  } else if (
      valid_symbols[STRING_START] && !scanner->in_string
      && (next == '"' || next == '\'')) {
    printf(">>>> string start\n");
    advance(lexer);
    lexer->mark_end(lexer);
    scanner->in_string = true;
    VEC_PUSH(scanner->quotes, next);
    lexer->result_symbol = STRING_START;
    return true;
  } else if (
      valid_symbols[STRING_END] && scanner->in_string
      && next == VEC_BACK(scanner->quotes)) {
    printf(">>>> string end\n");
    advance(lexer);
    lexer->mark_end(lexer);
    VEC_POP(scanner->quotes);
    scanner->in_string = false;
    lexer->result_symbol = STRING_END;
    return true;
  } else if (valid_symbols[INTERPOLATION_START]) {
    printf(">>>> interpolation start\n");
    assert(scanner->in_string || error_recovery);
    scanner->in_string = false;
    lexer->result_symbol = INTERPOLATION_START;
    return true;
  } else if (valid_symbols[INTERPOLATION_END] && next == '}') {
    printf(">>>> interpolation end\n");
    assert(!scanner->in_string || error_recovery);
    scanner->in_string = true;
    lexer->result_symbol = INTERPOLATION_END;
    return true;
  }

  // Comment?
  if (
      !scanner->in_string && next == '#'
      && (valid_symbols[TAGGED_LINE_COMMENT_START]
          || valid_symbols[TAGGED_COMMENT_START]
          || valid_symbols[PLAIN_COMMENT])) {
    return scan_comment(lexer, valid_symbols, at_line_start);
  }

  // Newline and indentation handling
  bool has_newline = false;

  // Skip any carriage returns
  while (lexer->lookahead == '\r') {
    skip(lexer);
  }

  // Check for newline
  if (lexer->lookahead == '\n') {
    has_newline = true;
    skip(lexer);

    // Skip any additional newlines and carriage returns
    while (lexer->lookahead == '\n' || lexer->lookahead == '\r') {
      skip(lexer);
    }

    // Skip whitespace to measure indentation
    skip_whitespace(lexer);
  }

  const uint16_t column = lexer->get_column(lexer);
  const bool eof = lexer->eof(lexer);

  printf(
      "scanner.scan: column: %u, current_indent: %u, num_indents: %u, has_newline: %i, eof: %i\n",
      column,
      current_indent,
      scanner->indents.len,
      has_newline,
      eof);

  // Mark the end after checking for dedents
  lexer->mark_end(lexer);

  // Allow expressions to continue across lines when the following line starts
  // with an operator, e.g.:
  //
  //   1
  //     + 2
  //
  // The continuation token identifies the operator precedence group, which lets
  // the grammar keep using its normal operator tokens.
  if (
      has_newline && column > current_indent
      && scan_operator_continuation(lexer, valid_symbols)) {
    printf(">>>> operator continuation\n");
    return true;
  }

  // Handle indent
  if (valid_symbols[INDENT] && has_newline && column > current_indent) {
    printf(">>>> indent: %u\n", column);
    VEC_PUSH(scanner->indents, column);
    lexer->result_symbol = INDENT;
    return true;
  }

  // Handle dedents
  if (valid_symbols[DEDENT] && !eof && column < current_indent) {
    printf(">>>> dedent: %u\n", column);
    VEC_POP(scanner->indents);
    lexer->result_symbol = DEDENT;
    return true;
  }

  // Handle EOF dedents
  if (valid_symbols[DEDENT] && eof && VEC_SIZE(scanner->indents) > 0) {
    printf(">>>> dedent (eof): %u\n", column);
    VEC_POP(scanner->indents);
    lexer->result_symbol = DEDENT;
    return true;
  }

  // Handle newline
  if (valid_symbols[NEWLINE] && has_newline) {
    printf(">>>> newline\n");
    lexer->result_symbol = NEWLINE;
    return true;
  }

  printf("scanner.scan: rejected\n");
  return false;
}

unsigned tree_sitter_koto_external_scanner_serialize(void* payload, char* buffer) {
  printf("scanner.serialize: payload %p, buffer %p\n", payload, buffer);

  char* write_ptr = buffer;

  Scanner* scanner = (Scanner*)payload;

  const uint32_t num_indents = scanner->indents.len;
  *((uint32_t*)write_ptr) = num_indents;
  write_ptr += sizeof(uint32_t);

  const unsigned indents_size = num_indents * sizeof(scanner->indents.data[0]);
  memcpy(write_ptr, scanner->indents.data, indents_size);
  write_ptr += indents_size;

  const uint32_t num_quotes = scanner->quotes.len;
  *((uint32_t*)write_ptr) = num_quotes;
  write_ptr += sizeof(uint32_t);

  memcpy(write_ptr, scanner->quotes.data, num_quotes);
  write_ptr += num_quotes;

  *write_ptr++ = scanner->in_string;
  *write_ptr++ = scanner->raw_string_hash_count;

  return write_ptr - buffer;
}

void tree_sitter_koto_external_scanner_deserialize(
    void* payload,
    const char* buffer,
    unsigned length) {
  printf(
      "scanner.deserialize: payload %p, buffer %p, length %d\n", payload, buffer, length);

  Scanner* scanner = (Scanner*)payload;
  initialize_scanner(scanner);

  if (length > 0) {
    const char* read_ptr = buffer;

    const uint32_t num_indents = *(uint32_t*)read_ptr;
    read_ptr += sizeof(uint32_t);

    VEC_CLEAR(scanner->indents);
    for (int i = 0; i < num_indents; i++) {
      const uint16_t indent = *(uint16_t*)read_ptr;
      read_ptr += sizeof(uint16_t);
      VEC_PUSH(scanner->indents, indent);
    }

    const uint32_t num_quotes = *(uint32_t*)read_ptr;
    read_ptr += sizeof(uint32_t);

    VEC_CLEAR(scanner->quotes);
    for (int i = 0; i < num_quotes; i++) {
      VEC_PUSH(scanner->quotes, *read_ptr++);
    }

    scanner->in_string = *read_ptr++;
    scanner->raw_string_hash_count = *read_ptr++;

    printf("scanner.deserialize: in_string %i\n", scanner->in_string);
  }
}

void* tree_sitter_koto_external_scanner_create() {
  printf("scanner.create\n");

  Scanner* scanner = calloc(1, sizeof(Scanner));
  initialize_scanner(scanner);

  printf("scanner.create: payload: %p\n", scanner);

  return scanner;
}

void tree_sitter_koto_external_scanner_destroy(void* payload) {
  printf("scanner.destroy: payload: %p\n", payload);
  Scanner* scanner = (Scanner*)payload;

  VEC_FREE(scanner->indents);
  VEC_FREE(scanner->quotes);
  free(scanner);
}
