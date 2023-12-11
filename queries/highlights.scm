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
  "match"
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

[
 "export"
 "from"
 "import"
] @include

(identifier) @variable

(import_module (identifier) @namespace)
(import_items (identifier) @namespace)
(export (identifier) @namespace)

(chain lookup: (identifier) @field)

[(true) (false)] @boolean
(comment) @comment
(debug) @debug
(string) @string
(null) @constant.builtin
(number) @number
(meta) @tag
(meta name: (identifier) @field) 
(self) @variable.builtin

(call name: (identifier) @function)
(arg (identifier) @parameter)
(ellipsis) @parameter

(entry_inline key: (identifier) @field)
(entry_block key: (identifier) @field)



