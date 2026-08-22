package security

import (
	"os"
	"strconv"
	"strings"

	"go.uber.org/zap"
)

// Config holds the input-hardening limits mandated by docs/SECURITY.md.
// All values are env-driven so the parser honors them without recompiling.
type Config struct {
	MaxFileBytes int64
	MaxFiles     int
	MaxDepth     int
	SkipPaths    map[string]bool
}

// ConfigFromEnv reads PARSER_* env vars with SECURITY.md defaults.
func ConfigFromEnv() Config {
	return Config{
		MaxFileBytes: envInt64("PARSER_MAX_FILE_BYTES", 1<<20), // 1MB
		MaxFiles:     envInt("PARSER_MAX_FILES", 50000),
		MaxDepth:     envInt("PARSER_MAX_DEPTH", 25),
		// Dependency and build directories, one set per language. Vendored code
		// is not this repository's graph, and it is what the file cap is spent
		// on if it is walked.
		SkipPaths: envSet("PARSER_SKIP_PATHS",
			"node_modules,.git,dist,build,coverage,.next,"+
				"vendor,target,__pycache__,.venv,venv,.gradle,.mypy_cache,.tox"),
	}
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envInt64(key string, def int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return def
}

func envSet(key, def string) map[string]bool {
	raw := def
	if v := os.Getenv(key); v != "" {
		raw = v
	}
	out := map[string]bool{}
	for _, p := range strings.Split(raw, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out[p] = true
		}
	}
	return out
}

// IsSkipped reports whether a path component is in the skip list.
func (c Config) IsSkipped(part string) bool {
	return c.SkipPaths[part]
}

var _ = zap.NewProduction // keep zap import for callers that log via this pkg
