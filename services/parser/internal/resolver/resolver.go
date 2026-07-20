package resolver
package resolver

import (
	"github.com/ARCoder181105/funcatlas/parser/internal/ir"
)

// ResolutionConfidence mirrors the DB CHECK constraint.
type ResolutionConfidence string

const (
	Exact     ResolutionConfidence = "exact"
	NameMatch ResolutionConfidence = "name_match"
	Unresolved ResolutionConfidence = "unresolved"
)

// Resolve links raw call sites to definitions using name/scope matching:
// same-file -> imported symbol -> package fallback -> unresolved.
// Phase 0: type + signature only; algorithm lands in Phase 2.
func Resolve(g ir.Graph) map[ir.CallSite]ResolutionConfidence {
	out := make(map[ir.CallSite]ResolutionConfidence)
	for _, c := range g.Calls {
		out[c] = Unresolved
	}
	return out
}
