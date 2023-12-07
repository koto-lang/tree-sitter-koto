#include "tree_sitter/parser.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

#if 1
#define printf(...)
#endif

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

#define VEC_NEW                                                                          \
  { .len = 0, .cap = 0, .data = NULL }

#define VEC_BACK(vec) ((vec).data[(vec).len - 1])

#define VEC_FREE(vec)                                                                    \
  {                                                                                      \
    if ((vec).data != NULL)                                                              \
      free((vec).data);                                                                  \
  }

#define VEC_CLEAR(vec) (vec).len = 0;

static inline void advance(TSLexer* lexer) {
  lexer->advance(lexer, false);
}

enum TokenType {
  NEWLINE,
  BLOCK_START,
  BLOCK_CONTINUE,
  BLOCK_END,
  INDENTED_LINE,
  ERROR_SENTINEL,
};

typedef struct {
  uint32_t len;
  uint32_t cap;
  uint16_t* data;
} IndentVec;

static IndentVec new_indent_vec() {
  IndentVec vec = VEC_NEW;
  vec.data = calloc(1, sizeof(uint16_t));
  vec.cap = 1;
  return vec;
}

typedef struct {
  // Keeping track of the block indent levels
  IndentVec indents;
  // If the previous token was a block end, then subsequent block ends and continues can
  // be generated without newlines.
  bool block_just_ended;
} Scanner;

static void initialize_scanner(Scanner* scanner) {
  // Ensure that the scanner is initialized with an indent at 0
  VEC_CLEAR(scanner->indents);
  VEC_PUSH(scanner->indents, 0);
  scanner->block_just_ended = false;
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
    advance(lexer);
  }
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

  if (error_recovery) {
    printf("scanner.scan: in error recovery\n");
  } else {
    bool newline = false;

    // Consume newlines and starting indentation
    while (true) {
      skip_whitespace(lexer);
      // new_indent = lexer->get_column(lexer);
      if (lexer->lookahead == '\r') {
        advance(lexer);
      }
      if (lexer->lookahead == '\n') {
        advance(lexer);
        newline = true;
        skip_whitespace(lexer);
      } else {
        break;
      }
    }

    const uint16_t block_indent = VEC_BACK(scanner->indents);
    const uint16_t column = lexer->get_column(lexer);
    const bool block_just_ended = scanner->block_just_ended;
    scanner->block_just_ended = false;

    printf(
        "scanner.scan: column: %u, block_indent: %u num_indents: %u newline: %i\n",
        column,
        block_indent,
        scanner->indents.len,
        newline);

    bool found_token = false;

    // Block start?
    if (valid_symbols[BLOCK_START] && newline && column > block_indent) {
      printf(">>>> block start: %u\n", column);
      VEC_PUSH(scanner->indents, column);
      lexer->result_symbol = BLOCK_START;
      found_token = true;
    }
    // Block continue?
    else if (
        valid_symbols[BLOCK_CONTINUE] && (newline || block_just_ended)
        && column == block_indent) {
      printf(">>>> block continue: %u\n", column);
      lexer->result_symbol = BLOCK_CONTINUE;
      found_token = true;
    }
    // Block end?
    else if (
        valid_symbols[BLOCK_END] && (newline || block_just_ended)
        && column < block_indent) {
      printf(">>>> block end: %u\n", column);
      VEC_POP(scanner->indents);
      scanner->block_just_ended = true;
      lexer->result_symbol = BLOCK_END;
      found_token = true;
    }
    // Indented line?
    else if (valid_symbols[INDENTED_LINE] && newline && column > block_indent) {
      printf(">>>> indented line\n");
      lexer->result_symbol = INDENTED_LINE;
      found_token = true;
    }
    // Newline?
    else if (valid_symbols[NEWLINE] && newline) {
      printf(">>>> newline!\n");
      lexer->result_symbol = NEWLINE;
      found_token = true;
    }

    if (found_token) {
      lexer->mark_end(lexer);
      return true;
    }
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

  *write_ptr++ = scanner->block_just_ended;

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

    scanner->block_just_ended = *read_ptr++;
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
  free(scanner);
}
