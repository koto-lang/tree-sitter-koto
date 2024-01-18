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
  ".."
  "..="
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

[
  "throw"
  "try"
  "catch"
  "finally"
] @exception

["(" ")" "[" "]" "|"] @punctuation.bracket

[
 "export"
 "from"
 "import"
 "as"
] @include

(identifier) @variable

(import_module (identifier) @namespace)
(import_item (identifier) @namespace)
(export (identifier) @namespace)

(chain lookup: (identifier) @field)
(chain start: (identifier) @function)

[(true) (false)] @boolean
(comment) @comment
(debug) @debug
(string) @string
(escape) @string.escape
(null) @constant.builtin
(number) @number
(meta) @tag
(meta name: (identifier) @field) 
(self) @variable.builtin

(arg (identifier) @parameter)
(ellipsis) @parameter

(entry_inline key: (identifier) @field)
(entry_block key: (identifier) @field)
