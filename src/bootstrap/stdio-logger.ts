import { Console } from "node:console";

const METHODS: Array<keyof Console> = [
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
const consoleMethods = console as unknown as Record<string, unknown>;

for (const method of METHODS) {
  const implementation = (stderrConsole as unknown as Record<string, unknown>)[method as string];
  if (typeof implementation === "function") {
    consoleMethods[method as string] = (...args: unknown[]) => {
      return (implementation as (...inner: unknown[]) => unknown).apply(stderrConsole, args);
    };
  }
}
