export const greet = (name: string) => {
    return `Hello ${name}`;
};

export const add = (a: number, b: number) => a + b;

let doSomething = function() {
    console.log("did something");
};

const obj = {
    notAFunc: 5
};

export function fetch(url: string): string;
export function fetch(url: string, opts: any): string;
export function fetch(url: string, opts?: any): string {
    return "done";
}

