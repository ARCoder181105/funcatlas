# The API and the parse worker, in one image.
#
# Build context is the **repo root**, not apps/api -- every COPY below reaches
# outside this directory. `docker-compose.yml` sets `context: .` and points
# `dockerfile:` here. It used to say `build: ./apps/api`, which put the context
# inside this folder and failed on the first COPY.
#
# One image for two services because they differ only in entrypoint, and
# keeping two Dockerfiles in step is a job nobody remembers to do. The worker is
# the one that actually needs the parser binary and git -- `runParser` is called
# from `queue/worker.ts` and nowhere else -- but splitting the image to save the
# API a few megabytes buys less than it costs.

# --- The Go parser -----------------------------------------------------------
# CGO is required: every tree-sitter grammar is a C library.
FROM golang:1.26-alpine AS parser
RUN apk add --no-cache build-base
WORKDIR /src
COPY services/parser/go.mod services/parser/go.sum ./
RUN go mod download
COPY services/parser/ ./
RUN CGO_ENABLED=1 go build -ldflags="-w -s" -o /parser ./cmd/parser

# --- Node dependencies -------------------------------------------------------
# Manifests only, so this layer survives every source edit.
#
# Node 24, not 20: `packageManager` pins pnpm 11.15.1, which uses a builtin
# module Node 20 does not have and dies with ERR_UNKNOWN_BUILTIN_MODULE before
# it installs anything.
FROM node:24-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json .npmrc ./
COPY apps/api/package.json apps/api/
# Both config packages are copied, not just shared: `tsconfig.json` extends
# `@funcatlas/typescript-config/base.json`, and without it tsc silently falls
# back to its own defaults -- ES3 target, no JSX namespace -- and reports forty
# downstream errors that all trace to one missing file.
COPY packages/shared/package.json packages/shared/
COPY packages/typescript-config/ packages/typescript-config/
COPY packages/eslint-config/package.json packages/eslint-config/
# Dev dependencies included on purpose: `tsx` is one, and the runtime needs it.
# `packages/shared` exports `./src/*.ts`, so plain node cannot follow them --
# see the CMD note. --frozen-lockfile so the image cannot silently resolve a
# different tree than the one committed.
RUN pnpm install --frozen-lockfile

# --- Runtime -----------------------------------------------------------------
FROM node:24-alpine AS runner
# git, because the parser shells out to `git clone` (internal/clone/clone.go).
# Without it a clone fails at runtime with a message about a missing binary,
# long after the image looked fine.
RUN apk add --no-cache git
RUN addgroup -S funcatlas && adduser -S funcatlas -G funcatlas
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api ./apps/api
# Shipped as source, not built. The API imports it through exports that point
# at `./src/*.ts`, which is why `node dist/index.js` exited immediately before.
COPY packages/shared ./packages/shared
COPY packages/typescript-config ./packages/typescript-config

COPY --from=parser /parser /usr/local/bin/funcatlas-parser

USER funcatlas
WORKDIR /app/apps/api
EXPOSE 3000

# tsx directly out of node_modules/.bin rather than through `pnpm` or corepack:
# corepack tries to fetch its pinned pnpm on first use, which a non-root user in
# a container with no network to the registry cannot do.
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
