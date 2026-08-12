package utils

// Only returns the single element of candidates; false for zero or many.
//
// A named function rather than an index expression so that taking the first of
// several matches is something you have to write on purpose. In the resolver,
// "many" means ambiguity, and ambiguity is never resolved by picking.
func Only(candidates []int) (int, bool) {
	if len(candidates) != 1 {
		return NoFunc, false
	}
	return candidates[0], true
}

// Chunk splits n items into half-open ranges of at most size, so multi-row
// INSERTs stay under the Postgres bind parameter limit.
func Chunk(n, size int, fn func(start, end int)) {
	if size <= 0 {
		size = n
	}
	for start := 0; start < n; start += size {
		fn(start, min(start+size, n))
	}
}
