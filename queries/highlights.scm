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

(call name: (identifier) @function)
(arg (identifier) @parameter)
(ellipsis) @parameter


[(true) (false)] @boolean
(null) @constant.builtin
(self) @variable.builtin

(number) @number

(debug) @debug
