package clone

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
)

var sha = regexp.MustCompile(`^[0-9a-f]{40}$`)

// The API hands the parser a URL and cannot know the SHA, so the parser has to
// read it off the checkout itself.
func TestHeadCommit(t *testing.T) {
	// This test file is inside a git repository, so ".." is one.
	assert.Regexp(t, sha, HeadCommit(".."))
}

func TestHeadBranch(t *testing.T) {
	assert.NotEmpty(t, HeadBranch(".."))
	// Never the literal "HEAD" -- that is what rev-parse reports on a detached
	// checkout, and storing it as a branch name is worse than storing nothing.
	assert.NotEqual(t, "HEAD", HeadBranch(".."))
}

// A local path being parsed need not be a repository. Absence is "unknown",
// not an error, and must not fail the parse.
func TestHeadDetectionOnNonRepo(t *testing.T) {
	dir := t.TempDir()
	assert.Empty(t, HeadCommit(dir))
	assert.Empty(t, HeadBranch(dir))
}
