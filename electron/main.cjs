/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, session } = require("electron");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

app.setName("Dental Consult CRM");

const defaultAppUrl = "https://dental-cunsult-crm.vercel.app";
const appUrl = process.env.DENTAL_CONSULT_APP_URL || defaultAppUrl;
const localApiPort = Number(process.env.DENTAL_CONSULT_LOCAL_API_PORT || 34254);
const isServerAgentMode = process.argv.includes("--agent");
let serverAgentProcess;
let serverAgentHeartbeat;

function getAppOrigin() {
  return new URL(appUrl).origin;
}

function isTrustedRendererUrl(value) {
  try {
    return new URL(value).origin === getAppOrigin();
  } catch {
    return false;
  }
}

function isPrivateNetworkHost(hostname) {
  if (["localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(hostname)) {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  const matched172Address = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  return Boolean(matched172Address && Number(matched172Address[1]) >= 16 && Number(matched172Address[1]) <= 31);
}

function isAllowedLocalApiUrl(value) {
  try {
    const url = new URL(value);
    const allowedPath =
      url.pathname === "/health" ||
      url.pathname === "/clinic" ||
      url.pathname === "/clients" ||
      url.pathname.startsWith("/clients/") ||
      url.pathname.startsWith("/dentweb/") ||
      url.pathname.startsWith("/app-data/") ||
      url.pathname.startsWith("/local-db/") ||
      url.pathname.startsWith("/supabase-sync/");

    return (
      url.protocol === "http:" &&
      isPrivateNetworkHost(url.hostname) &&
      Number(url.port || 80) === localApiPort &&
      allowedPath
    );
  } catch {
    return false;
  }
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!isTrustedRendererUrl(navigationUrl)) {
      event.preventDefault();
    }
  });
  void window.loadURL(appUrl);
}

function getBundledAgentPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "agent", "dentweb-local-api-server.cjs");
  }

  return path.join(__dirname, "..", "scripts", "dentweb-local-api-server.cjs");
}

function getAgentRuntimeDirectory() {
  return path.join(app.getPath("userData"), "agent");
}

function getBundledNodeModulesDirectory() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "node_modules");
  }

  return path.join(__dirname, "..", "node_modules");
}

function readServerAgentConfig() {
  try {
    const configPath = path.join(getAgentRuntimeDirectory(), "server-config.json");
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const port = Number(parsed.port);

    if (parsed.mode !== "server" || !Number.isInteger(port) || port < 1 || port > 65535) {
      return null;
    }

    return { port };
  } catch {
    return null;
  }
}

async function isServerAgentHealthy(port) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function startBundledServerAgent() {
  if (serverAgentProcess && !serverAgentProcess.killed) {
    return;
  }

  const agentPath = getBundledAgentPath();

  if (!fs.existsSync(agentPath)) {
    throw new Error(`Bundled local API agent was not found: ${agentPath}`);
  }

  fs.mkdirSync(getAgentRuntimeDirectory(), { recursive: true });
  serverAgentProcess = childProcess.spawn(process.execPath, [agentPath], {
    detached: false,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      DENTAL_CONSULT_RUNTIME_DIR: getAgentRuntimeDirectory(),
      DENTAL_CONSULT_NODE_MODULES_DIR: getBundledNodeModulesDirectory(),
    },
  });

  serverAgentProcess.on("error", (error) => {
    console.error("Could not start the Dental Consult server agent.", error);
  });

  serverAgentProcess.once("exit", () => {
    serverAgentProcess = undefined;
  });

  // A scheduled task runs this hidden parent process. The timer keeps it
  // alive while its child owns the local HTTP API.
  serverAgentHeartbeat = setInterval(() => {}, 60_000);
}

async function ensureBundledServerAgentRunning() {
  const config = readServerAgentConfig();

  if (!config) {
    return false;
  }

  if (await isServerAgentHealthy(config.port)) {
    return true;
  }

  startBundledServerAgent();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(350);

    if (await isServerAgentHealthy(config.port)) {
      return true;
    }
  }

  return false;
}

function stopBundledServerAgent() {
  if (serverAgentHeartbeat) {
    clearInterval(serverAgentHeartbeat);
  }

  if (serverAgentProcess && !serverAgentProcess.killed) {
    serverAgentProcess.kill();
  }
}

app.whenReady().then(async () => {
  if (isServerAgentMode) {
    startBundledServerAgent();
    return;
  }

  // A server PC may also be used as a regular workstation. If its server
  // configuration already exists, restore the hidden DentWeb agent before the
  // renderer starts requesting reception and patient data.
  await ensureBundledServerAgentRunning();

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  ipcMain.handle("dental-consult:local-api-request", async (event, request) => {
    if (!isTrustedRendererUrl(event.senderFrame.url)) {
      throw new Error("untrusted_renderer");
    }

    if (!request || typeof request !== "object" || !isAllowedLocalApiUrl(request.url)) {
      throw new Error("local_api_target_not_allowed");
    }

    const method = ["GET", "POST", "PUT", "DELETE"].includes(request.method)
      ? request.method
      : "GET";
    const headers = request.headers && typeof request.headers === "object" ? request.headers : {};
    const response = await fetch(request.url, {
      method,
      headers,
      body: typeof request.body === "string" ? request.body : undefined,
    });

    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    };
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (!isServerAgentMode && process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", stopBundledServerAgent);
