import { register } from "node:module";

// Register ts-node ESM loader using the recommended `register` API to avoid
// the experimental loader warning shown during CI runs.
const projectRootUrl = new URL("../", import.meta.url);
register("ts-node/esm", projectRootUrl);
