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
	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
	"github.com/ARCoder181105/funcatlas/parser/internal/resolver"
	"github.com/ARCoder181105/funcatlas/parser/internal/security"
	"github.com/ARCoder181105/funcatlas/parser/internal/ts"
)

func main() {
	_ = godotenv.Load()

	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("init logger: %v", err)
	}
	defer func() { _ = logger.Sync() }()

	repo := flag.String("repo", "", "local path or git URL to parse")
	out := flag.String("out", "out.json", "output file path, or - for stdout")
	format := flag.String("format", "json", "output format: json|summary")
	write := flag.Bool("write", false, "write the graph to Postgres (needs DATABASE_URL)")
	repoURL := flag.String("repo-url", "", "repo identity for --write; defaults to --repo")
	branch := flag.String("branch", "main", "default branch recorded on the repo row")
	commit := flag.String("commit", "", "commit SHA recorded on every row written")
	flag.Parse()

	if *repo == "" {
		logger.Fatal("missing --repo")
	}

	cfg := security.ConfigFromEnv()
	root, err := clone.New(logger, cfg).Prepare(*repo)
	if err != nil {
		logger.Fatal("clone/prepare failed", zap.Error(err))
	}

	graph, err := ts.Extract(logger, root, cfg)
	if err != nil {
		logger.Fatal("parse failed", zap.Error(err))
	}
	edges := resolver.Resolve(graph)

	if err := report(*format, *out, graph, edges); err != nil {
		logger.Fatal("output failed", zap.Error(err))
	}

	if !*write {
		return
	}
	if err := writeGraph(logger, graph, edges, *repoURL, *repo, *branch, *commit); err != nil {
		logger.Fatal("write failed", zap.Error(err))
	}
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

func writeGraph(logger *zap.Logger, graph ir.Graph, edges []ir.Edge, repoURL, repo, branch, commit string) error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("--write needs DATABASE_URL")
	}
	if repoURL == "" {
		repoURL = repo
	}

	ctx := context.Background()
	writer, err := db.NewWriter(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer writer.Close()

	stats, err := writer.WriteGraph(ctx, graph, edges, db.Options{
		RepoURL: repoURL, Branch: branch, Commit: commit,
	})
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
