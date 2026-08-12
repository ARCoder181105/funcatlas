module github.com/ARCoder181105/funcatlas/parser

go 1.25.0

require (
	github.com/jackc/pgx/v5 v5.10.0
	github.com/joho/godotenv v1.5.1
	github.com/stretchr/testify v1.11.1
	github.com/tree-sitter/go-tree-sitter v0.25.0
	github.com/tree-sitter/tree-sitter-typescript v0.23.2
	go.uber.org/zap v1.28.0
)

// The tree-sitter-typescript Go binding lives under bindings/go but its go.mod
// declares the parent module path. Map the subpath to the parent module.
replace github.com/tree-sitter/tree-sitter-typescript/bindings/go => github.com/tree-sitter/tree-sitter-typescript v0.23.2

require (
	github.com/davecgh/go-spew v1.1.2-0.20180830191138-d8f796af33cc // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/mattn/go-pointer v0.0.1 // indirect
	github.com/pmezard/go-difflib v1.0.1-0.20181226105442-5d4384ee4fb2 // indirect
	github.com/rogpeppe/go-internal v1.15.0 // indirect
	go.uber.org/multierr v1.10.0 // indirect
	golang.org/x/sync v0.18.0 // indirect
	golang.org/x/text v0.31.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)
