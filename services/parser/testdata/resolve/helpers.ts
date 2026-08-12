export function helper() {
    return 2;
}

// Not imported by main.ts, and the only `onlyOne` in the package.
export function onlyOne() {
    return 3;
}

export class Repo {
    sync() {
        return "synced";
    }
}
