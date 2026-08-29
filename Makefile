# funcatlas — common developer tasks
# Run `make <target>`. Most targets shell out to pnpm/turbo or docker.
# `make start` is the one that brings the whole thing up; `make help` lists all.

.PHONY: setup start stop wait-infra migrate-test install dev build lint typecheck test \
        migrate up down health parser-isolated \
        go-build go-build-bin go-test go-vet go-run go-tidy go-lint clean

# Loads .env into a recipe's shell. Sourced rather than `include`d: Make would
# read a `#` inside a value as a comment and try to expand a `$`. Recipes that
# need a variable from it write `$$DATABASE_URL`, not `$(DATABASE_URL)`.
ENV := set -a && . ./.env && set +a

setup: ## One-time: write .env, generate secrets, create the test database
	@test -f .env && echo ".env already exists, leaving it alone." || { \
	  cp .env.example .env; \
	  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$$(openssl rand -hex 32)|" .env; \
	  sed -i "s|^GITHUB_WEBHOOK_SECRET=.*|GITHUB_WEBHOOK_SECRET=$$(openssl rand -hex 32)|" .env; \
	  sed -i "s|^FUNCATLAS_SINGLE_USER=.*|FUNCATLAS_SINGLE_USER=$$(id -un)|" .env; \
	  echo "Wrote .env with generated secrets."; \
	  echo ""; \
	  echo "  FUNCATLAS_SINGLE_USER=$$(id -un) -- the API will run with NO"; \
	  echo "  AUTHENTICATION so you do not need a GitHub OAuth app. Compose"; \
	  echo "  publishes on 127.0.0.1 only. Do not expose the port."; \
	  echo "  Blank the value in .env to use real GitHub sign-in instead."; \
	  echo ""; \
	}
	$(MAKE) up
	$(MAKE) wait-infra
	@# Idempotent: the second run finds the database and says so.
	$(ENV) && docker compose exec -T postgres psql -U funcatlas -d postgres \
	  -c "CREATE DATABASE funcatlas_test OWNER funcatlas" 2>/dev/null \
	  && echo "Created funcatlas_test." || echo "funcatlas_test already exists."
	@echo ""
	@echo "Ready. Run 'docker compose up' and open http://localhost:5173"

start: ## Bring up EVERYTHING: Postgres, Redis, migrations, parser binary, API, web
	@test -f .env || { echo "No .env — copy .env.example to .env first."; exit 1; }
	$(MAKE) up
	$(MAKE) wait-infra
	$(MAKE) migrate
	$(MAKE) go-build-bin
	@echo ""
	@echo "  API  http://localhost:3000"
	@echo "  Web  http://localhost:5173   <- open this"
	@echo ""
	@echo "  Sign in with GitHub. Ctrl-C stops API, web and the parse worker;"
	@echo "  Postgres and Redis keep running until 'make stop'."
	@echo ""
	$(MAKE) dev

stop: ## Stop Postgres and Redis (data survives; they are on named volumes)
	docker compose stop postgres redis

wait-infra: ## Block until Postgres and Redis both accept connections
	@echo "waiting for postgres..."
	@until docker compose exec -T postgres pg_isready -U funcatlas >/dev/null 2>&1; do sleep 1; done
	@echo "postgres ready"
	# Redis too, not just Postgres: sessions live here, so an API that starts
	# first answers every sign-in with a 500 from ioredis rather than anything
	# that points at Redis being down.
	@echo "waiting for redis..."
	@until [ "$$(docker compose exec -T redis redis-cli ping 2>/dev/null | tr -d '\r')" = "PONG" ]; do sleep 1; done
	@echo "redis ready"

install: ## Install all workspace dependencies
	pnpm install

dev: ## Run api + web + parse worker in dev mode. Assumes infra is already up.
	pnpm dev

build: ## Build all packages
	pnpm build

lint: ## Lint all packages
	pnpm lint

typecheck: ## Type-check all packages
	pnpm typecheck

test: ## Run all tests (TS + Go)
	@# A running compose worker consumes the very jobs queue/parse.test.ts
	@# enqueues and asserts on, so the failures read as a broken queue rather
	@# than as two things sharing one Redis.
	@docker compose ps --services --filter status=running 2>/dev/null | grep -qx worker && { \
	  echo "The compose worker is running; it will consume the jobs these tests assert on."; \
	  echo "Run 'docker compose stop worker' first."; \
	  exit 1; \
	} || true
	pnpm test
	# Sourced, or dbtest finds no DATABASE_URL and every integration test skips
	# -- a green run that never touched Postgres.
	$(ENV) && cd services/parser && go test ./...

migrate: ## Apply database migrations to DATABASE_URL
	$(ENV) && migrate -path services/parser/migrations -database "$$DATABASE_URL" up

migrate-test: ## Apply migrations to TEST_DATABASE_URL (the database `make test` truncates)
	$(ENV) && migrate -path services/parser/migrations -database "$$TEST_DATABASE_URL" up

down: ## Roll back the last database migration
	$(ENV) && migrate -path services/parser/migrations -database "$$DATABASE_URL" down 1

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

parser-isolated: ## Run the parser in its container with no network at all (docs/SECURITY.md L31)
	@echo "Building the parser image..."
	docker compose build parser
	@echo ""
	@echo "Parsing a local fixture with network_mode: none, read_only, cap_drop ALL."
	@echo "A repository URL cannot work here -- that is the point."
	docker compose run --rm --no-deps \
	  -v "$(PWD)/services/parser/testdata/resolve:/fixture:ro" \
	  parser --repo /fixture --format summary --out -

go-run: ## Run the parser against a local repo (usage: make go-run REPO=./path)
	# abspath, because the recipe cds into services/parser and REPO is written
	# relative to the repo root -- which is where everything else in here is.
	cd services/parser && go run ./cmd/parser --repo "$(abspath $(REPO))" --format summary

clean: ## Clean up generated artifacts and caches
	pnpm store prune
	rm -rf dist build .turbo node_modules out || true

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'
