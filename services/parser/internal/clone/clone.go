package clone
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

type CloneError struct{ Msg string }

func (e *CloneError) Error() string { return "clone failed: " + e.Msg }
