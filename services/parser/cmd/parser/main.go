package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

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
	out := flag.String("out", "out.json", "output file path or /dev/stdout")
	format := flag.String("format", "json", "output format: json|summary")
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

	if *format == "summary" {
		fmt.Printf("files: %d\nfunctions: %d\ncalls: %d\nimports: %d\n", 
			len(graph.Files), len(graph.Functions), len(graph.Calls), len(graph.Imports))
	} else {
		data, err := json.MarshalIndent(graph, "", "  ")
		if err != nil {
			logger.Fatal("json marshal failed", zap.Error(err))
		}
		if *out == "/dev/stdout" || *out == "-" {
			fmt.Println(string(data))
		} else {
			if err := os.WriteFile(*out, data, 0644); err != nil {
				logger.Fatal("write out.json failed", zap.Error(err))
			}
		}
	}

	// Phase 2: resolve calls -> write to Postgres via db.Writer.
	_ = db.NewWriter // referenced for Phase 2 wiring
}
