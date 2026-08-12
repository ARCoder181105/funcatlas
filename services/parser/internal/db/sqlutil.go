package db

import (
	"strconv"
	"strings"
)

// SQL construction helpers shared by the insert paths.

// placeholders builds "($1,$2),($3,$4)" for rows of the given width, starting
// at $1. Used to batch inserts into one round trip.
func placeholders(rows, width int) string {
	var b strings.Builder
	n := 1
	for r := 0; r < rows; r++ {
		if r > 0 {
			b.WriteByte(',')
		}
		b.WriteByte('(')
		for c := 0; c < width; c++ {
			if c > 0 {
				b.WriteByte(',')
			}
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			n++
		}
		b.WriteByte(')')
	}
	return b.String()
}
