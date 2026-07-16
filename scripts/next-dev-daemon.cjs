const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const logDir = path.join(projectRoot, ".next-dev-logs");
fs.mkdirSync(logDir, { recursive: true });

const out = fs.openSync(path.join(logDir, "out.log"), "a");
const err = fs.openSync(path.join(logDir, "err.log"), "a");
const nextBin = path.join(
  projectRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

const child = spawn(
  process.execPath,
  [nextBin, "dev", "--port", "3100", "--hostname", "127.0.0.1"],
  {
    cwd: projectRoot,
    windowsHide: true,
    stdio: ["pipe", out, err],
  },
);

const shutdown = (signal) => {
  child.kill(signal);
  process.exit(0);
};

child.on("exit", (code, signal) => {
  fs.writeSync(err, `next exited code=${code} signal=${signal}\n`);
  process.exit(code ?? 1);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

setInterval(() => {
  if (child.stdin.writable) {
    child.stdin.write("\n");
  }
}, 60_000);
