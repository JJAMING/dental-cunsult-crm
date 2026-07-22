/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("node:path");

const defaultAppUrl = "https://dental-cunsult-crm.vercel.app";
const appUrl = process.env.DENTAL_CONSULT_APP_URL || defaultAppUrl;
const localApiPort = Number(process.env.DENTAL_CONSULT_LOCAL_API_PORT || 34254);

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

app.whenReady().then(() => {
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
