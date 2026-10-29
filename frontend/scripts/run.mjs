import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = resolve(frontend, "..");
const local = (name) => resolve(project, ".work", name);
for (const name of ["tmp", "npm-cache", "cache", "pip-cache", "matplotlib"])
  mkdirSync(local(name), { recursive: true });

const env = {
  ...process.env,
  TEMP: local("tmp"),
  TMP: local("tmp"),
  TMPDIR: local("tmp"),
  npm_config_cache: local("npm-cache"),
  PIP_CACHE_DIR: local("pip-cache"),
  MPLCONFIGDIR: local("matplotlib"),
  XDG_CACHE_HOME: local("cache"),
  NEXT_TELEMETRY_DISABLED: "1",
};
const mode = process.argv[2];
if (!["dev", "build", "start", "typecheck", "test"].includes(mode)) {
  console.error("Expected dev, build, start, typecheck, or test.");
  process.exit(1);
}
const executable = mode === "test" ? "--experimental-strip-types" : mode === "typecheck"
  ? resolve(frontend, "node_modules/typescript/bin/tsc")
  : resolve(frontend, "node_modules/next/dist/bin/next");
const args = mode === "test" ? ["--test", resolve(frontend, "tests/analysis.test.mjs"), resolve(frontend, "tests/camera.test.mjs"), resolve(frontend, "tests/camera-client.test.mjs"), resolve(frontend, "tests/review.test.mjs")] : mode === "typecheck"
  ? ["--noEmit"]
  : [mode, ...(["dev", "start"].includes(mode) ? ["--hostname", "127.0.0.1"] : [])];
const child = spawn(process.execPath, [executable, ...args, ...process.argv.slice(3)], {
  cwd: frontend,
  env,
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { child.kill(signal); });
}
child.on("exit", (code) => { process.exitCode = code ?? 1; });
