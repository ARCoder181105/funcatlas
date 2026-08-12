# funcatlas — common developer tasks
# Run `make <target>`. Most targets shell out to pnpm/turbo or docker.

.PHONY: install dev build lint typecheck test migrate up down health \
        go-build go-build-bin go-test go-vet go-run go-tidy go-lint clean

install: ## Install all workspace dependencies
	pnpm install

dev: ## Run api + web + parser in dev mode (hot reload)
	pnpm dev

build: ## Build all packages
	pnpm build

lint: ## Lint all packages
	pnpm lint

typecheck: ## Type-check all packages
	pnpm typecheck

test: ## Run all tests (TS + Go)
	pnpm test
	cd services/parser && go test ./...

migrate: ## Apply database migrations (requires DATABASE_URL in .env)
	migrate -path services/parser/migrations -database "$(DATABASE_URL)" up

down: ## Roll back the last database migration
	migrate -path services/parser/migrations -database "$(DATABASE_URL)" down 1

up: ## Start Postgres + Redis via docker compose
	docker compose up -d postgres redis

health: ## Check the API health endpoint
	curl -fsS localhost:3000/healthz

# --- Go (services/parser) ---
go-build: ## Build the Go parser
	cd services/parser && go build ./...

go-build-bin: ## Build the parser binary the API spawns (PARSER_BIN)
	cd services/parser && go build -o bin/parser ./cmd/parser

go-test: ## Run Go parser tests
	cd services/parser && go test ./...

go-vet: ## Vet the Go parser
	cd services/parser && go vet ./...

go-tidy: ## Tidy Go modules
	cd services/parser && go mod tidy

go-lint: ## Lint the Go parser
	cd services/parser && golangci-lint run

go-run: ## Run the parser against a local repo (usage: make go-run REPO=./path)
	cd services/parser && go run ./cmd/parser --repo "$(REPO)"

clean: ## Clean up generated artifacts and caches
	pnpm store prune
	rm -rf dist build .turbo node_modules out || true

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'
