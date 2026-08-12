// Two declarations sharing one qualified_name. Name matching cannot choose.
if (globalThis.flag) {
    function dup() {
        return "a";
    }
} else {
    function dup() {
        return "b";
    }
}
