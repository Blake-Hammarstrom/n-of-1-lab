// Static build: copy src/ to dist/. No bundler, no dependencies: the browser loads ES modules directly.
import { cpSync, rmSync } from "node:fs";
rmSync(new URL("./dist", import.meta.url), { recursive: true, force: true });
cpSync(new URL("./src", import.meta.url), new URL("./dist", import.meta.url), { recursive: true });
console.log("built dist/");
