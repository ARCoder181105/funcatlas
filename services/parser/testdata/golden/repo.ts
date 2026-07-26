export class Repo {
    sync() {
        function cb() {}
        cb();
    }
}

export function fetch(url: string): string;
export function fetch(url: string, opts: any): string;
export function fetch(url: string, opts?: any): string {
    return "done";
}

const greet = (name: string) => `Hello ${name}`;
let f = function() {};

import { a as b } from "x";
import * as ns from "y";
import "z";

function caller() {
    Repo.sync();
    greet("world");
}
