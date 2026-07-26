# Multi-stage build. Runtime runs with --network none, read-only mount, dropped
# caps, non-root (docs/SECURITY.md). CGO is required for tree-sitter.
FROM golang:1.24-alpine@sha256:8bee1901f1e530bfb4a7850aa7a479d17ae3a18beb6e09064ed54cfd245b7191 AS build
WORKDIR /src
RUN apk add --no-cache build-base
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -ldflags="-w -s" -o /parser ./cmd/parser

FROM alpine:3.19@sha256:6baf43584bcb78f2e5847d1de515f23499913ac9f12bdf834811a3145eb11ca1
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/sh -D appuser
COPY --from=build /parser /parser
USER 1000:1000
ENTRYPOINT ["/parser"]
