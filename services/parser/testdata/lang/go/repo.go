package store

import (
	"fmt"
	stdsync "sync"

	"example.com/app/internal/util"
)

type Repo struct {
	mu stdsync.Mutex
}

// Sync is a pointer-receiver method: its qualified name has to carry Repo.
func (r *Repo) Sync(id string) error {
	defer r.unlock()
	go func() {
		notify(id)
	}()
	return util.Wrap(fmt.Errorf("sync %s", id))
}

func (r Repo) unlock() {
	r.mu.Unlock()
}

func notify(id string) {
	println(id)
}

// Map is generic. A call to it is written Map[int](xs, f), which parses as a
// call over an index_expression rather than over a plain identifier.
func Map[T any, U any](in []T, fn func(T) U) []U {
	out := make([]U, 0, len(in))
	for _, v := range in {
		out = append(out, fn(v))
	}
	return out
}

func useGenerics(xs []int) []string {
	return Map[int, string](xs, describe)
}

func describe(v int) string {
	return fmt.Sprint(v)
}

// A single type argument is genuinely ambiguous with a conversion: tree-sitter
// parses Map[int](xs) as a type_conversion_expression, identical in shape to
// int(x). Capturing it would invent a call for every conversion in the repo,
// so it is dropped -- unresolved by omission rather than a guess.
func useSingleTypeArgument(xs []int) []int {
	return Identity[int](xs)
}

func Identity[T any](in []T) []T {
	return in
}
