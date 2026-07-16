const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const projectRoot = "C:\\Dental Consult CRM";
const logPath = path.join(projectRoot, "dev-3100.node.log");
const log = fs.createWriteStream(logPath, { flags: "a" });

function write(message) {
  log.write(`[${new Date().toISOString()}] ${message}\n`);
}

write("launching next dev on http://127.0.0.1:3100/dashboard");

const child = spawn(
  "C:\\Program Files\\nodejs\\node.exe",
  ["node_modules\\next\\dist\\bin\\next", "dev", "-p", "3100", "-H", "127.0.0.1"],
  {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: process.env,
  },
);

child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });

child.on("exit", (code, signal) => {
  write(`next dev exited with code=${code ?? ""} signal=${signal ?? ""}`);
  log.end(() => process.exit(code ?? 0));
});

process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
