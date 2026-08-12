// Two function_declaration nodes sharing one qualified_name in one file.
// This is what overload_index exists for -- NOT TypeScript overload
// signatures, which parse as function_signature and are never captured.
// The resolver must refuse to pick between these.

if (process.env.NODE_ENV === "production") {
    function dup() {
        return "prod";
    }
} else {
    function dup() {
        return "dev";
    }
}

function unique() {
    return dup();
}
