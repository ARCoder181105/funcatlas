# Multi-stage build. Runtime runs with --network none, read-only mount, dropped
# caps, non-root (docs/SECURITY.md). CGO is required for tree-sitter.
FROM golang:1.24-alpine AS build
WORKDIR /src
RUN apk add --no-cache build-base
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -ldflags="-w -s" -o /parser ./cmd/parser

FROM alpine:3.19
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/sh -D appuser
COPY --from=build /parser /parser
USER 1000:1000
ENTRYPOINT ["/parser"]
