import { Console } from "node:console";
const METHODS = [
    "log",
    "info",
    "debug",
    "warn",
    "error",
    "dir",
    "trace",
    "time",
    "timeEnd",
    "timeLog",
    "table",
    "group",
    "groupCollapsed",
    "groupEnd",
    "count",
    "countReset",
    "assert",
    "profile",
    "profileEnd",
];
const stderrConsole = new Console({ stdout: process.stderr, stderr: process.stderr });
const consoleMethods = console;
for (const method of METHODS) {
    const implementation = stderrConsole[method];
    if (typeof implementation === "function") {
        consoleMethods[method] = (...args) => {
            return implementation.apply(stderrConsole, args);
        };
    }
}
