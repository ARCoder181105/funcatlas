package clone

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var sha = regexp.MustCompile(`^[0-9a-f]{40}$`)

// initRepo builds a repository with one commit on a known branch.
//
// Deliberately not the ambient checkout: CI checks out a detached HEAD for a
// pull request, so a test that assumes "the working tree is on a branch" is
// asserting a property of one machine rather than of git.
func initRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	git := func(args ...string) {
		t.Helper()
		out, err := exec.Command("git", append([]string{"-C", dir}, args...)...).CombinedOutput()
		require.NoError(t, err, string(out))
	}

	git("init", "-q")
	git("checkout", "-q", "-b", "trunk")
	git("config", "user.email", "test@funcatlas.local")
	git("config", "user.name", "funcatlas test")
	// A signing key the runner does not have would fail the commit.
	git("config", "commit.gpgsign", "false")

	require.NoError(t, os.WriteFile(filepath.Join(dir, "a.ts"), []byte("export const a = 1\n"), 0o644))
	git("add", ".")
	git("commit", "-qm", "first")

	return dir
}

// The API hands the parser a URL and cannot know the SHA, so the parser has to
// read it off the checkout itself.
func TestHeadCommitAndBranch(t *testing.T) {
	dir := initRepo(t)

	assert.Regexp(t, sha, HeadCommit(dir))
	assert.Equal(t, "trunk", HeadBranch(dir))
}

// A detached head has a commit but no branch. rev-parse reports the literal
// "HEAD" here, and storing that as a branch name is worse than storing nothing.
func TestHeadBranchOnDetachedHead(t *testing.T) {
	dir := initRepo(t)
	out, err := exec.Command("git", "-C", dir, "checkout", "-q", "--detach").CombinedOutput()
	require.NoError(t, err, string(out))

	assert.Empty(t, HeadBranch(dir))
	assert.Regexp(t, sha, HeadCommit(dir), "a detached head still has a commit")
}

// A local path being parsed need not be a repository. Absence is "unknown",
// not an error, and must not fail the parse.
func TestHeadDetectionOnNonRepo(t *testing.T) {
	dir := t.TempDir()

	assert.Empty(t, HeadCommit(dir))
	assert.Empty(t, HeadBranch(dir))
}
