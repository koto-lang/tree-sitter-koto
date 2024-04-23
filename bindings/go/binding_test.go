package tree_sitter_koto_test

import (
	"testing"

	tree_sitter "github.com/smacker/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-koto"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_koto.Language())
	if language == nil {
		t.Errorf("Error loading Koto grammar")
	}
}
