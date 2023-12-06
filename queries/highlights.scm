; Literals

[
  "-"
  "*"
  "/"
  "%"
  "+"
  "<"
  "=="
  "!="
  ">"
  ">="
  "and"
  "not"
  "or"
] @operator

(comment) @comment
(string) @string

(identifier) @variable

[(true) (false)] @boolean
(null) @constant.builtin

(number) @number
