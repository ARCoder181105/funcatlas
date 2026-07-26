package main

import (
	"flag"
	"log"

	"github.com/joho/godotenv"

	"github.com/ARCoder181105/funcatlas/parser/internal/clone"
	"github.com/ARCoder181105/funcatlas/parser/internal/db"
	"github.com/ARCoder181105/funcatlas/parser/internal/security"
	"github.com/ARCoder181105/funcatlas/parser/internal/ts"
	"go.uber.org/zap"
)

// Phase 0: wires the pipeline skeleton. Real resolution + DB write land in Phase 2.
func main() {
	_ = godotenv.Load()

	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("init logger: %v", err)
	}
	defer func() { _ = logger.Sync() }()

	repo := flag.String("repo", "", "local path or git URL to parse")
	flag.Parse()
	if *repo == "" {
		logger.Fatal("missing --repo")
	}

	cfg := security.ConfigFromEnv()
	cloner := clone.New(logger, cfg)
	root, err := cloner.Prepare(*repo)
	if err != nil {
		logger.Fatal("clone/prepare failed", zap.Error(err))
	}

	graph, err := ts.Extract(logger, root, cfg)
	if err != nil {
		logger.Fatal("parse failed", zap.Error(err))
	}
	logger.Info("extracted", zap.Int("files", len(graph.Files)), zap.Int("functions", len(graph.Functions)))

	// Phase 2: resolve calls -> write to Postgres via db.Writer.
	_ = db.NewWriter // referenced for Phase 2 wiring
}
