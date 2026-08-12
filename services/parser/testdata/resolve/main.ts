import { helper, Repo } from "./helpers";
import { readFile } from "node:fs";
import { dup } from "./dup";
import * as deep from "./nested/deep";
import def from "./helpers";

function local() {
    return 1;
}

function outer() {
    function inner() {
        return 1;
    }
    inner();
}

function recurse(n: number): number {
    return recurse(n - 1);
}

export function main() {
    local();
    helper();
    onlyOne();
    readFile();
    shared();
    dup();
    obj.method();
    Repo.sync();
    deep.deepOnly();
    def();
    outer();
    recurse(3);
}
