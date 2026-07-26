# Multi-stage build. Runtime runs with --network none, read-only mount, dropped
# caps, non-root (docs/SECURITY.md). CGO is required for tree-sitter.
FROM golang:1.26-alpine@sha256:0178a641fbb4858c5f1b48e34bdaabe0350a330a1b1149aabd498d0699ff5fb2 AS build
WORKDIR /src
RUN apk add --no-cache build-base
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -ldflags="-w -s" -o /parser ./cmd/parser

FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/sh -D appuser
COPY --from=build /parser /parser
USER 1000:1000
ENTRYPOINT ["/parser"]
