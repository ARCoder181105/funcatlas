package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"go.uber.org/zap"

	"github.com/ARCoder181105/funcatlas/parser/internal/clone"
	"github.com/ARCoder181105/funcatlas/parser/internal/db"
	"github.com/ARCoder181105/funcatlas/parser/internal/extract"
	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/resolver"
	"github.com/ARCoder181105/funcatlas/parser/internal/security"
	"github.com/ARCoder181105/funcatlas/parser/internal/utils"
)

func main() {
	_ = godotenv.Load()

	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("init logger: %v", err)
	}
	defer func() { _ = logger.Sync() }()

	// run rather than a body full of logger.Fatal: Fatal calls os.Exit, which
	// skips every deferred call -- including the one that removes the clone. A
	// repository that failed to parse used to leak a checkout on every attempt.
	if err := run(logger); err != nil {
		logger.Fatal("parser failed", zap.Error(err))
	}
}

func run(logger *zap.Logger) error {

	repo := flag.String("repo", "", "local path or git URL to parse")
	out := flag.String("out", "out.json", "output file path, or - for stdout")
	format := flag.String("format", "json", "output format: json|summary")
	write := flag.Bool("write", false, "write the graph to Postgres (needs DATABASE_URL)")
	repoURL := flag.String("repo-url", "", "repo identity for --write; defaults to --repo")
	branch := flag.String("branch", "", "default branch recorded on the repo row; detected when empty")
	commit := flag.String("commit", "", "commit SHA recorded on every row written; detected when empty")
	incremental := flag.Bool("incremental", false, "with --write, rewrite only the rows whose files changed")
	flag.Parse()

	if *repo == "" {
		return fmt.Errorf("missing --repo")
	}

	cfg := security.ConfigFromEnv()
	root, cleanup, err := clone.New(logger, cfg).Prepare(*repo)
	// A clone used to be left behind on every run. Removed here rather than
	// inside Prepare: everything below reads from it.
	defer cleanup()
	if err != nil {
		return fmt.Errorf("clone/prepare failed: %w", err)
	}

	graph, err := extract.Extract(logger, root, cfg)
	if err != nil {
		return fmt.Errorf("parse failed: %w", err)
	}
	edges := resolver.Resolve(graph)

	if err := report(*format, *out, graph, edges); err != nil {
		return fmt.Errorf("output failed: %w", err)
	}

	if !*write {
		return nil
	}

	// Read off the checkout rather than made a required flag: the caller that
	// hands us a URL has not cloned anything and cannot know the SHA.
	if *commit == "" {
		if *commit = clone.HeadCommit(root); *commit == "" {
			logger.Warn("no commit SHA; rows will be written without one")
		}
	}
	if *branch == "" {
		if *branch = clone.HeadBranch(root); *branch == "" {
			*branch = utils.DefaultBranch
		}
	}

	if err := writeGraph(logger, graph, edges, *repo, db.Options{
		RepoURL:     *repoURL,
		Branch:      *branch,
		Commit:      *commit,
		Incremental: *incremental,
	}); err != nil {
		return fmt.Errorf("write failed: %w", err)
	}

	return nil
}

// report prints the graph. Works with no database configured, so --format json
// stays usable for inspection.
func report(format, out string, graph ir.Graph, edges []ir.Edge) error {
	if format == "summary" {
		fmt.Printf("files: %d\nfunctions: %d\ncalls: %d\nimports: %d\nedges: %d\n",
			len(graph.Files), len(graph.Functions), len(graph.Calls), len(graph.Imports), len(edges))
		for _, c := range []string{"exact", "name_match", "unresolved"} {
			fmt.Printf("  %-11s %d\n", c, countConfidence(edges, c))
		}
		return nil
	}

	data, err := json.MarshalIndent(struct {
		ir.Graph
		Edges []ir.Edge
	}{graph, edges}, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	if out == "-" || out == "/dev/stdout" {
		fmt.Println(string(data))
		return nil
	}
	return os.WriteFile(out, data, 0o644)
}

func writeGraph(logger *zap.Logger, graph ir.Graph, edges []ir.Edge, repo string, opts db.Options) error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("--write needs DATABASE_URL")
	}
	if opts.RepoURL == "" {
		opts.RepoURL = repo
	}

	ctx := context.Background()
	writer, err := db.NewWriter(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer writer.Close()

	stats, err := writer.WriteGraph(ctx, graph, edges, opts)
	if err != nil {
		return err
	}

	logger.Info("graph written",
		zap.Int64("repo_id", stats.RepoID), zap.Int("files", stats.Files),
		zap.Int("functions", stats.Functions), zap.Int("edges", stats.Edges))
	return nil
}

func countConfidence(edges []ir.Edge, confidence string) int {
	n := 0
	for _, e := range edges {
		if e.Confidence == confidence {
			n++
		}
	}
	return n
}
