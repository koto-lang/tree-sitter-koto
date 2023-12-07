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
  "not"
  "or"
  "if"
  "then"
  "else"
  "else if"
] @keyword

["(" ")" "[" "]" "|"] @punctuation.bracket

(comment) @comment
(string) @string
(identifier) @variable
(meta) @tag

(call name: (identifier) @function)
(arg (identifier) @parameter)
(ellipsis) @parameter


[(true) (false)] @boolean
(null) @constant.builtin
(self) @variable.builtin

(number) @number

(debug) @debug
