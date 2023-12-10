[
  "="
  "+"
  "-"
  "*"
  "/"
  "%"
  "+="
  "-="
  "*="
  "/="
  "%="
  "=="
  "!="
  "<"
  ">"
  "<="
  ">="
] @operator

[
  "and"
  (break)
  (continue)
  "not"
  "or"
  "return"
  "yield"
] @keyword

[
  "if"
  "then"
  "else"
  "else if"
  "switch"
] @conditional

[
  "for"
  "in"
  "loop"
  "until"
  "while"
] @repeat

["(" ")" "[" "]" "|"] @punctuation.bracket

(comment) @comment
(string) @string
(identifier) @variable
(meta) @tag
(meta name: (identifier)) @field

(call name: (identifier) @function)
(arg (identifier) @parameter)
(ellipsis) @parameter

(entry_inline key: (identifier) @field)
(entry_block key: (identifier) @field)
(entry_block key: (meta) @tag)
(entry_block key: (meta name: (identifier)) @field)

[(true) (false)] @boolean
(null) @constant.builtin
(self) @variable.builtin

(number) @number

(debug) @debug
