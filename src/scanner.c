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
  CONTINUATION,
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
  IndentVec indents;
} Scanner;

static void initialize_scanner(Scanner* scanner) {
  VEC_CLEAR(scanner->indents);
  VEC_PUSH(scanner->indents, 0);
}

static void skip_whitespace(TSLexer* lexer) {
  printf("skipping whitespace\n");
  while (true) {
    uint32_t next = lexer->lookahead;
    printf("skipping (%u)\n", next);
    if (next != ' ' && next != '\t') {
      break;
    }
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

  for (int i = 0; i <= ERROR_SENTINEL; i++) {
    printf("scanner.scan: valid symbol %i - %i\n", i, valid_symbols[i]);
  }

  const bool error_recovery = valid_symbols[ERROR_SENTINEL];

  printf("error_recovery: %i\n", error_recovery);

  if (!error_recovery) {
    bool encountered_newline = false;
    bool newline_indented = false;

    // Consume newlines and starting indentation
    while (true) {
      skip_whitespace(lexer);
      if (lexer->lookahead == '\r') {
        advance(lexer);
      }
      if (lexer->lookahead == '\n') {
        advance(lexer);
        encountered_newline = true;
        skip_whitespace(lexer);
        newline_indented = (lexer->get_column(lexer)) > 0;
      } else {
        break;
      }
    }

    if (valid_symbols[CONTINUATION] && newline_indented) {
      lexer->mark_end(lexer);
      lexer->result_symbol = CONTINUATION;
      printf("continuation!\n");
      return true;
    }

    if (valid_symbols[NEWLINE] && encountered_newline) {
      lexer->mark_end(lexer);
      lexer->result_symbol = NEWLINE;
      printf("newline!\n");
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

    for (int i = 0; i < num_indents; i++) {
      const uint16_t indent = *(uint16_t*)read_ptr;
      read_ptr += sizeof(uint16_t);
      VEC_GROW(scanner->indents, indent);
    }
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
  free(scanner);
}
