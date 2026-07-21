# Multi-stage build. Runtime runs with --network none, read-only mount, dropped
# caps, non-root (docs/SECURITY.md). CGO is required for tree-sitter.
FROM golang:1.22 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -o /parser ./cmd/parser

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /parser /parser
USER nonroot:nonroot
ENTRYPOINT ["/parser"]
