package security

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"go.uber.org/zap"
)

// ContainsRoot rejects any path that escapes root (symlink / ../ traversal).
// Returns the cleaned absolute path inside root, or an error.
func ContainsRoot(root, target string) (string, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(absRoot, absTarget)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || rel == "" {
		return "", os.ErrPermission
	}
	return absTarget, nil
}

// Walk enumerates files under root, applying SECURITY.md caps:
// skip-list dirs, max depth, max file count, and per-file size limit.
func Walk(logger *zap.Logger, root string, cfg Config) ([]string, error) {
	var out []string
	count := 0

	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if cfg.IsSkipped(d.Name()) {
				return filepath.SkipDir
			}
			depth := strings.Count(path, string(os.PathSeparator)) -
				strings.Count(root, string(os.PathSeparator))
			if depth > cfg.MaxDepth {
				return filepath.SkipDir
			}
			return nil
		}
		if count >= cfg.MaxFiles {
			logger.Warn("file cap reached, stopping walk", zap.Int("max", cfg.MaxFiles))
			return fs.SkipAll
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return os.ErrPermission
		}
		if info.Size() > cfg.MaxFileBytes {
			logger.Warn("skipping oversized file", zap.String("path", path))
			return nil
		}
		if _, err := ContainsRoot(root, path); err != nil {
			return err
		}
		out = append(out, path)
		count++
		return nil
	})
	if err != nil && err != fs.SkipAll {
		return nil, err
	}
	return out, nil
}
