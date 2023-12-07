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
  "and"
  "not"
  "or"
] @operator

[
  "if"
  "then"
  "else"
  "else if"
] @keyword

["(" ")" "[" "]"] @punctuation.bracket

(comment) @comment
(string) @string
(identifier) @variable

(call name: (identifier) @function)
(meta) @tag

[(true) (false)] @boolean
(null) @constant.builtin
(self) @variable.builtin

(number) @number

(debug) @debug
