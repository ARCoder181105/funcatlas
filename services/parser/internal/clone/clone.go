package clone

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"go.uber.org/zap"

	"github.com/ARCoder181105/funcatlas/parser/internal/security"
)

// Cloner prepares a repo for parsing: a local path is used as-is, a git URL
// is cloned into tmp/. Never runs install/build scripts (docs/SECURITY.md).
type Cloner struct {
	log *zap.Logger
	cfg security.Config
}

func New(log *zap.Logger, cfg security.Config) *Cloner {
	return &Cloner{log: log, cfg: cfg}
}

// Prepare returns the absolute root path to parse.
func (c *Cloner) Prepare(repo string) (string, error) {
	if strings.HasPrefix(repo, "http://") || strings.HasPrefix(repo, "https://") ||
		strings.HasPrefix(repo, "git@") {
		dir, err := os.MkdirTemp("", "funcatlas-clone-")
		if err != nil {
			return "", err
		}
		c.log.Info("cloning repo", zap.String("url", repo))
		cmd := exec.Command("git", "clone", "--depth", "1", repo, dir)
		// A private or missing repo makes git ask for credentials. On a host with a
		// terminal that blocks until PARSE_TIMEOUT_MS; fail immediately instead.
		cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_ASKPASS=", "SSH_ASKPASS=")
		if out, err := cmd.CombinedOutput(); err != nil {
			return "", &CloneError{Msg: string(out)}
		}
		return dir, nil
	}
	abs, err := filepath.Abs(repo)
	if err != nil {
		return "", err
	}
	return abs, nil
}

// HeadCommit returns the checked-out commit SHA, or "" when dir is not a git
// repository -- a local path being parsed need not be one.
func HeadCommit(dir string) string {
	return gitOutput(dir, "rev-parse", "HEAD")
}

// HeadBranch returns the checked-out branch, or "" on a detached head or a
// non-repository. Cloning takes whatever the remote's default is, so assuming
// "main" records the wrong branch for every repo that still uses "master".
func HeadBranch(dir string) string {
	branch := gitOutput(dir, "rev-parse", "--abbrev-ref", "HEAD")
	if branch == "HEAD" {
		return ""
	}
	return branch
}

// gitOutput runs git in dir and returns trimmed stdout, or "" on any failure.
// Callers treat absence as "unknown", not as an error.
func gitOutput(dir string, args ...string) string {
	out, err := exec.Command("git", append([]string{"-C", dir}, args...)...).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

type CloneError struct{ Msg string }

func (e *CloneError) Error() string { return "clone failed: " + e.Msg }
