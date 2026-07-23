const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

// Packaged desktop installs pass a per-user runtime directory. Keeping this
// outside the install folder prevents updates from overwriting clinic data.
const runtimeDir = process.env.DENTAL_CONSULT_RUNTIME_DIR
  ? path.resolve(process.env.DENTAL_CONSULT_RUNTIME_DIR)
  : path.join(process.cwd(), ".dentweb-local");
const configPath = path.join(runtimeDir, "server-config.json");
const clientsPath = path.join(runtimeDir, "clients.json");
const localDbPath = path.join(runtimeDir, "local.db");
const serverSecretsPath = path.join(runtimeDir, "server-secrets.env");
const localDbSchemaVersion = 2;
const validClientStatuses = new Set(["pending_approval", "approved", "rejected"]);
const dentwebProcessKeywords = ["dentweb", "dent", "dental"];
const dentwebDbFileNames = [
  "dentweb.db",
  "dentweb.sqlite",
  "dentweb.sqlite3",
  "dentweb.mdb",
  "dentweb.accdb",
  "dwdb.mdb",
  "dwdb.accdb",
  "patient.db",
  "patient.mdb",
];
const dentwebProbeFileExtensions = new Set([
  ".json",
  ".db",
  ".sqlite",
  ".sqlite3",
  ".mdb",
  ".accdb",
  ".fdb",
  ".gdb",
]);
const dentwebJsonSnapshotFileNames = [
  "dentweb-snapshot.json",
  "snapshot.json",
  "dentweb.json",
  "dentweb-patients.json",
  "patients.json",
  "patient-snapshots.json",
  "dentweb-appointments.json",
  "appointments.json",
  "appointment-snapshots.json",
];
const defaultConfig = {
  clinicId: "acro-dental",
  clinicName: "Acro Dental",
  mode: "server",
  host: "0.0.0.0",
  port: 34254,
  pairingCode: "",
  autoDiscoveryEnabled: true,
  dentwebSourcePath: "",
  dentwebSourceMapping: null,
  dentwebSqlServer: null,
};

defaultConfig.clinicName = "Acro Dental";

const localDbTableDefinitions = [
  {
    name: "schema_meta",
    purpose: "Central DB schema metadata",
    createSql: `
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `,
  },
  {
    name: "clinics",
    purpose: "Clinic master records for tenant separation",
    createSql: `
      CREATE TABLE IF NOT EXISTS clinics (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'local',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `,
  },
  {
    name: "consultations",
    purpose: "Dental Consult CRM consultation journal rows",
    createSql: `
      CREATE TABLE IF NOT EXISTS consultations (
        id INTEGER PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        clinic_name TEXT,
        consultation_date TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        chart_no TEXT,
        patient_type TEXT,
        counselor TEXT,
        doctor TEXT,
        visit_channel TEXT,
        treatment_category TEXT,
        consulted_teeth INTEGER NOT NULL DEFAULT 0,
        agreed_teeth INTEGER NOT NULL DEFAULT 0,
        result TEXT,
        consultation_amount INTEGER NOT NULL DEFAULT 0,
        agreed_amount INTEGER NOT NULL DEFAULT 0,
        partial_agreement INTEGER NOT NULL DEFAULT 0,
        agreement_cancelled INTEGER NOT NULL DEFAULT 0,
        disagreement_reason TEXT,
        memo TEXT,
        source TEXT NOT NULL DEFAULT 'app',
        source_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `,
  },
  {
    name: "recall_records",
    purpose: "Recall progress keyed by consultation",
    createSql: `
      CREATE TABLE IF NOT EXISTS recall_records (
        consultation_id INTEGER PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `,
  },
  {
    name: "admin_settings",
    purpose: "Per-clinic admin settings snapshot",
    createSql: `
      CREATE TABLE IF NOT EXISTS admin_settings (
        clinic_id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `,
  },
  {
    name: "dentweb_patients_snapshot",
    purpose: "Read-only Dentweb patient snapshot cache",
    createSql: `
      CREATE TABLE IF NOT EXISTS dentweb_patients_snapshot (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        chart_no TEXT,
        patient_name TEXT,
        birth_date TEXT,
        phone_hash TEXT,
        raw_json TEXT NOT NULL,
        synced_at TEXT NOT NULL
      )
    `,
  },
  {
    name: "dentweb_appointments_snapshot",
    purpose: "Read-only Dentweb appointment snapshot cache",
    createSql: `
      CREATE TABLE IF NOT EXISTS dentweb_appointments_snapshot (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        appointment_date TEXT,
        chart_no TEXT,
        patient_name TEXT,
        raw_json TEXT NOT NULL,
        synced_at TEXT NOT NULL
      )
    `,
  },
  {
    name: "sync_runs",
    purpose: "Dentweb sync audit trail",
    createSql: `
      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        source TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        read_only INTEGER NOT NULL DEFAULT 1,
        summary_json TEXT,
        error_message TEXT
      )
    `,
  },
  {
    name: "device_events",
    purpose: "Client device and server activity log",
    createSql: `
      CREATE TABLE IF NOT EXISTS device_events (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        device_id TEXT,
        event_type TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL
      )
    `,
  },
  {
    name: "supabase_sync_jobs",
    purpose: "Reliable Supabase synchronization queue",
    createSql: `
      CREATE TABLE IF NOT EXISTS supabase_sync_jobs (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        clinic_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (entity_type, entity_id, clinic_id)
      )
    `,
  },
];

const localDbIndexDefinitions = [
  `CREATE INDEX IF NOT EXISTS idx_dentweb_patients_clinic_name
   ON dentweb_patients_snapshot (clinic_id, patient_name)`,
  `CREATE INDEX IF NOT EXISTS idx_dentweb_patients_clinic_chart
   ON dentweb_patients_snapshot (clinic_id, chart_no)`,
  `CREATE INDEX IF NOT EXISTS idx_dentweb_appointments_clinic_chart_date
   ON dentweb_appointments_snapshot (clinic_id, chart_no, appointment_date)`,
  `CREATE INDEX IF NOT EXISTS idx_dentweb_appointments_clinic_name_date
   ON dentweb_appointments_snapshot (clinic_id, patient_name, appointment_date)`,
  `CREATE INDEX IF NOT EXISTS idx_supabase_sync_jobs_created
   ON supabase_sync_jobs (created_at)`,
];

let sqliteModule;
let mssqlModule;
let localDb;
let supabaseSyncInProgress = false;
let supabaseSyncTimer;
const dentwebReceptionCache = new Map();
const dentwebReceptionCacheDurationMs = 4_000;
const serverSecretKeys = new Set([
  "DENTAL_CONSULT_SUPABASE_URL",
  "DENTAL_CONSULT_SUPABASE_SERVICE_ROLE_KEY",
  "DENTWEB_SQL_PASSWORD",
]);

function loadServerSecrets() {
  if (!fs.existsSync(serverSecretsPath)) {
    return;
  }

  try {
    const lines = fs.readFileSync(serverSecretsPath, "utf8").split(/\r?\n/);

    lines.forEach((line) => {
      const matched = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);

      if (!matched || !serverSecretKeys.has(matched[1]) || process.env[matched[1]]) {
        return;
      }

      const value = matched[2].replace(/^(["'])(.*)\1$/, "$2").trim();

      if (value) {
        process.env[matched[1]] = value;
      }
    });
  } catch {
    // Keep the local API available even when the optional server secrets file is unreadable.
  }
}

loadServerSecrets();

function persistServerSecret(key, value) {
  if (!serverSecretKeys.has(key)) {
    throw new Error("Unsupported server secret key.");
  }

  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    throw new Error("A non-empty server secret is required.");
  }

  ensureRuntimeDir();
  const existingLines = fs.existsSync(serverSecretsPath)
    ? fs.readFileSync(serverSecretsPath, "utf8").split(/\r?\n/)
    : [];
  const nextLines = [];
  let replaced = false;

  existingLines.forEach((line) => {
    const matched = line.match(/^\s*([A-Z0-9_]+)\s*=/);

    if (matched?.[1] === key) {
      nextLines.push(`${key}=${normalizedValue}`);
      replaced = true;
      return;
    }

    if (line.trim()) {
      nextLines.push(line);
    }
  });

  if (!replaced) {
    nextLines.push(`${key}=${normalizedValue}`);
  }

  fs.writeFileSync(serverSecretsPath, `${nextLines.join("\n")}\n`, { mode: 0o600 });
  process.env[key] = normalizedValue;
}

function getCommonDentwebPaths() {
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const programData = process.env.ProgramData;
  const localAppData = process.env.LOCALAPPDATA;
  const systemDrive = process.env.SystemDrive || "C:";
  const pathCandidates = [
    path.join(systemDrive, "Dentweb"),
    path.join(systemDrive, "DENTWEB"),
    path.join(systemDrive, "DentWeb"),
    path.join(systemDrive, "DW"),
    "D:\\Dentweb",
    "D:\\DENTWEB",
    "D:\\DentWeb",
    programFiles ? path.join(programFiles, "Dentweb") : "",
    programFiles ? path.join(programFiles, "DentWeb") : "",
    programFilesX86 ? path.join(programFilesX86, "Dentweb") : "",
    programFilesX86 ? path.join(programFilesX86, "DentWeb") : "",
    programData ? path.join(programData, "Dentweb") : "",
    programData ? path.join(programData, "DentWeb") : "",
    localAppData ? path.join(localAppData, "Dentweb") : "",
    localAppData ? path.join(localAppData, "DentWeb") : "",
  ];

  return [...new Set(pathCandidates.filter(Boolean))];
}

function ensureRuntimeDir() {
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }
}

function ensureRuntimeConfig() {
  ensureRuntimeDir();

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`);
    return { ...defaultConfig };
  }

  try {
    const parsedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

    return {
      ...defaultConfig,
      ...parsedConfig,
      port: Number.isFinite(Number(parsedConfig.port)) ? Number(parsedConfig.port) : defaultConfig.port,
    };
  } catch {
    return { ...defaultConfig };
  }
}

function getConfig() {
  const config = ensureRuntimeConfig();

  return {
    ...config,
    clinicId: process.env.DENTWEB_CLINIC_ID || config.clinicId,
    clinicName: process.env.DENTWEB_CLINIC_NAME || config.clinicName,
    host: process.env.DENTWEB_API_HOST || config.host,
    port: process.env.DENTWEB_API_PORT ? Number(process.env.DENTWEB_API_PORT) : config.port,
    pairingCode: process.env.DENTWEB_PAIRING_CODE || config.pairingCode,
    dentwebSourcePath: process.env.DENTWEB_SOURCE_PATH || sanitizeManualPath(config.dentwebSourcePath),
    dentwebSourceMapping: normalizeDentwebSourceMapping(config.dentwebSourceMapping),
    dentwebSqlServer: normalizeDentwebSqlServerConfig({
      ...config.dentwebSqlServer,
      server: process.env.DENTWEB_SQL_SERVER || config.dentwebSqlServer?.server,
      port: process.env.DENTWEB_SQL_PORT || config.dentwebSqlServer?.port,
      database: process.env.DENTWEB_SQL_DATABASE || config.dentwebSqlServer?.database,
      user: process.env.DENTWEB_SQL_USER || config.dentwebSqlServer?.user,
    }),
  };
}

function writeRuntimeConfig(nextConfig) {
  ensureRuntimeDir();
  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
}

function persistDentwebSourcePath(config, sourcePath) {
  const normalizedSourcePath = sanitizeManualPath(sourcePath);
  const nextConfig = {
    ...ensureRuntimeConfig(),
    dentwebSourcePath: normalizedSourcePath,
  };

  writeRuntimeConfig(nextConfig);
  config.dentwebSourcePath = normalizedSourcePath;

  return normalizedSourcePath;
}

function normalizeDentwebSqlServerConfig(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const server = String(value.server || value.host || "").trim();
  const database = String(value.database || "").trim();
  const user = String(value.user || value.username || "").trim();
  const parsedPort = Number(value.port);
  const port = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 1433;

  if (!server || !database || !user) {
    return null;
  }

  return {
    adapterId: "mssql_dentweb_readonly",
    server,
    port,
    database,
    user,
    encrypt: Boolean(value.encrypt),
    trustServerCertificate: value.trustServerCertificate !== false,
  };
}

function getDentwebSqlServerConfig(config) {
  return normalizeDentwebSqlServerConfig(config.dentwebSqlServer);
}

function toPublicDentwebSqlServerConfig(config) {
  const databaseConfig = getDentwebSqlServerConfig(config);

  if (!databaseConfig) {
    return {
      configured: false,
      hasPassword: Boolean(process.env.DENTWEB_SQL_PASSWORD),
      config: null,
    };
  }

  return {
    configured: true,
    hasPassword: Boolean(process.env.DENTWEB_SQL_PASSWORD),
    config: databaseConfig,
  };
}

function persistDentwebSqlServerConfig(config, value, password) {
  const normalizedConfig = normalizeDentwebSqlServerConfig(value);

  if (!normalizedConfig) {
    throw new Error("SQL Server address, port, database, and read-only user are required.");
  }

  if (typeof password === "string" && password.trim()) {
    persistServerSecret("DENTWEB_SQL_PASSWORD", password);
  }

  const nextConfig = {
    ...ensureRuntimeConfig(),
    dentwebSqlServer: normalizedConfig,
  };

  writeRuntimeConfig(nextConfig);
  config.dentwebSqlServer = normalizedConfig;

  return toPublicDentwebSqlServerConfig(config);
}

const dentwebMappingFields = {
  patients: ["chartNo", "patientName", "birthDate", "phone"],
  appointments: ["appointmentDate", "appointmentTime", "chartNo", "patientName", "doctor", "status"],
};

const dentwebMappingFieldLabels = {
  patients: {
    chartNo: "차트번호",
    patientName: "환자명",
    birthDate: "생년월일",
    phone: "연락처",
  },
  appointments: {
    appointmentDate: "예약일",
    appointmentTime: "예약시간",
    chartNo: "차트번호",
    patientName: "환자명",
    doctor: "담당의",
    status: "예약상태",
  },
};

function normalizeDentwebFieldMap(value, allowedFields) {
  const rawColumns = value?.columns && typeof value.columns === "object" ? value.columns : {};
  const rawMatchedColumns =
    value?.matchedColumns && typeof value.matchedColumns === "object" ? value.matchedColumns : {};

  return allowedFields.reduce((columns, fieldKey) => {
    const directValue = rawColumns[fieldKey];
    const matchedValue = rawMatchedColumns[fieldKey]?.columnName;
    const columnName =
      typeof directValue === "string" && directValue.trim()
        ? directValue.trim()
        : typeof matchedValue === "string" && matchedValue.trim()
          ? matchedValue.trim()
          : "";

    if (columnName) {
      columns[fieldKey] = columnName;
    }

    return columns;
  }, {});
}

function normalizeDentwebTableMapping(value, allowedFields) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const tableName = typeof value.tableName === "string" ? value.tableName.trim() : "";
  const columns = normalizeDentwebFieldMap(value, allowedFields);

  if (!tableName) {
    return null;
  }

  return {
    tableName,
    columns,
  };
}

function normalizeDentwebSourceMapping(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const adapterId =
    typeof value.adapterId === "string" && value.adapterId.trim()
      ? value.adapterId.trim()
      : "sqlite_mapped_readonly";
  const sourcePath = sanitizeManualPath(value.sourcePath);
  const sourceFile = sanitizeManualPath(value.sourceFile);
  const patients = normalizeDentwebTableMapping(value.patients, dentwebMappingFields.patients);
  const appointments = normalizeDentwebTableMapping(value.appointments, dentwebMappingFields.appointments);
  const savedAt = typeof value.savedAt === "string" && value.savedAt.trim() ? value.savedAt : "";

  if (!patients && !appointments) {
    return null;
  }

  return {
    adapterId,
    sourcePath,
    sourceFile,
    patients,
    appointments,
    savedAt,
  };
}

function getDentwebSourceMapping(config) {
  return normalizeDentwebSourceMapping(config.dentwebSourceMapping);
}

function persistDentwebSourceMapping(config, mapping) {
  const normalizedMapping = normalizeDentwebSourceMapping({
    ...mapping,
    savedAt: new Date().toISOString(),
  });

  if (!normalizedMapping) {
    throw new Error("A patient or appointment table mapping is required.");
  }

  const nextConfig = {
    ...ensureRuntimeConfig(),
    dentwebSourceMapping: normalizedMapping,
  };

  if (normalizedMapping.sourcePath) {
    nextConfig.dentwebSourcePath = normalizedMapping.sourcePath;
  }

  writeRuntimeConfig(nextConfig);
  config.dentwebSourceMapping = normalizedMapping;

  if (normalizedMapping.sourcePath) {
    config.dentwebSourcePath = normalizedMapping.sourcePath;
  }

  return normalizedMapping;
}

function getSqliteModule() {
  if (sqliteModule) {
    return sqliteModule;
  }

  try {
    sqliteModule = require("node:sqlite");
    return sqliteModule;
  } catch {
    return null;
  }
}

function setLocalDbMeta(db, key, value) {
  db.prepare(`
    INSERT INTO schema_meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, String(value), new Date().toISOString());
}

function getMssqlModule() {
  if (mssqlModule) {
    return mssqlModule;
  }

  try {
    mssqlModule = require("mssql");
    return mssqlModule;
  } catch {
    // Packaged agents run from resources/agent, while dependencies remain in
    // the Electron application archive. The desktop parent supplies this
    // server-local fallback path only when starting the agent.
    const bundledModulesDirectory = String(process.env.DENTAL_CONSULT_NODE_MODULES_DIR || "").trim();

    if (!bundledModulesDirectory) {
      return null;
    }

    try {
      mssqlModule = require(path.join(bundledModulesDirectory, "mssql"));
      return mssqlModule;
    } catch {
      return null;
    }
  }
}

function getDentwebSqlServerSourceLabel(config) {
  const databaseConfig = getDentwebSqlServerConfig(config);

  return databaseConfig
    ? `mssql://${databaseConfig.server}:${databaseConfig.port}/${databaseConfig.database}`
    : "";
}

function getDentwebMssqlConnectionOptions(config) {
  const databaseConfig = getDentwebSqlServerConfig(config);
  const password = String(process.env.DENTWEB_SQL_PASSWORD || "").trim();

  if (!databaseConfig || !password) {
    throw new Error("Dentweb SQL Server connection is not configured on this server PC.");
  }

  return {
    user: databaseConfig.user,
    password,
    server: databaseConfig.server,
    port: databaseConfig.port,
    database: databaseConfig.database,
    options: {
      encrypt: databaseConfig.encrypt,
      trustServerCertificate: databaseConfig.trustServerCertificate,
      enableArithAbort: true,
    },
    pool: {
      max: 2,
      min: 0,
      idleTimeoutMillis: 10_000,
    },
    connectionTimeout: 8_000,
    requestTimeout: 15_000,
  };
}

async function withDentwebSqlServer(config, callback) {
  const sql = getMssqlModule();

  if (!sql?.ConnectionPool) {
    throw new Error("The SQL Server read-only adapter is not installed.");
  }

  const pool = new sql.ConnectionPool(getDentwebMssqlConnectionOptions(config));

  try {
    await pool.connect();
    return await callback({ sql, pool });
  } finally {
    try {
      await pool.close();
    } catch {
      // Closing a failed read-only connection is best effort.
    }
  }
}

function formatDentwebAppointmentDate(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length < 8) {
    return "";
  }

  return digits.slice(0, 8);
}

function formatDentwebAppointmentTime(value) {
  const digits = String(value || "").replace(/\D/g, "");

  return digits.length >= 12 ? digits.slice(8, 12) : "";
}

function mapDentwebAppointmentStatus(value) {
  const status = Number(value);
  const labels = {
    0: "미이행",
    1: "이행",
    2: "취소",
    3: "보류",
  };

  return labels[status] || "";
}

function getKoreanDateDigits(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}${values.month}${values.day}`;
}

function normalizeDentwebReceptionDate(value) {
  const digits = String(value || "").replace(/\D/g, "");

  return digits.length === 8 ? digits : getKoreanDateDigits();
}

function getDentwebRowValue(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row || {}, key)) {
      return row[key];
    }
  }

  return undefined;
}

function formatDentwebReceptionTime(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length < 4) {
    return "";
  }

  return digits.slice(-4);
}

function getDentwebReceptionWaitMinutes(value, statusCode) {
  if (![0, 1].includes(Number(statusCode))) {
    return null;
  }

  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length < 12) {
    return null;
  }

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const hour = Number(digits.slice(8, 10));
  const minute = Number(digits.slice(10, 12));
  const receivedAt = new Date(year, month - 1, day, hour, minute);
  const elapsed = Math.floor((Date.now() - receivedAt.getTime()) / 60_000);

  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

function getDentwebReceptionAge(birthDate, referenceDate) {
  const birthDigits = String(birthDate || "").replace(/\D/g, "");
  const referenceDigits = String(referenceDate || "").replace(/\D/g, "");

  if (birthDigits.length !== 8 || referenceDigits.length !== 8) {
    return null;
  }

  const birthYear = Number(birthDigits.slice(0, 4));
  const birthMonth = Number(birthDigits.slice(4, 6));
  const birthDay = Number(birthDigits.slice(6, 8));
  const referenceYear = Number(referenceDigits.slice(0, 4));
  const referenceMonth = Number(referenceDigits.slice(4, 6));
  const referenceDay = Number(referenceDigits.slice(6, 8));
  let age = referenceYear - birthYear;

  if (referenceMonth < birthMonth || (referenceMonth === birthMonth && referenceDay < birthDay)) {
    age -= 1;
  }

  return Number.isFinite(age) && age >= 0 ? age : null;
}

function mapDentwebReceptionStatus(value) {
  const status = Number(value);
  const labels = {
    0: "접수",
    1: "준비완료",
    2: "진료중",
    3: "진료완료",
    4: "수납완료",
  };

  return {
    code: Number.isFinite(status) ? status : -1,
    label: labels[status] || "확인 필요",
  };
}

function mapDentwebReceptionRow(row, index, totalCount, staffNames, chairNames, date) {
  const status = mapDentwebReceptionStatus(getDentwebRowValue(row, ["n상태", "status", "Status"]));
  const birthDate = normalizeMappedValue(getDentwebRowValue(row, ["sz생년월일", "birthDate"]));
  const genderValue = getDentwebRowValue(row, ["b성별", "gender", "Gender"]);
  const doctorId = normalizeMappedValue(getDentwebRowValue(row, ["n담당의사", "doctorId"]));
  const staffId = normalizeMappedValue(getDentwebRowValue(row, ["담당직원", "n담당직원", "staffId"]));
  const chairId = normalizeMappedValue(getDentwebRowValue(row, ["체어", "n체어", "chairId"]));
  const receptionAt = normalizeMappedValue(getDentwebRowValue(row, ["sz접수시각", "receptionAt"]));
  const isFemale = genderValue === true || genderValue === 1 || genderValue === "1";
  const isNewPatient = getDentwebRowValue(row, ["b신환여부", "isNewPatient", "newPatient"]);

  return {
    // DentWeb returns the newest reception first. Keep that useful display
    // order while showing the actual daily reception order in reverse.
    sequence: totalCount - index,
    statusCode: status.code,
    statusLabel: status.label,
    patientId: normalizeMappedValue(getDentwebRowValue(row, ["n환자ID", "patientId"])),
    chartNo: normalizeMappedValue(getDentwebRowValue(row, ["sz차트번호", "chartNo"])),
    patientName: normalizeMappedValue(getDentwebRowValue(row, ["sz이름", "patientName"])),
    birthDate,
    age: getDentwebReceptionAge(birthDate, date),
    gender: genderValue === null || genderValue === undefined ? "" : isFemale ? "female" : "male",
    patientType: isNewPatient === true || isNewPatient === 1 || isNewPatient === "1" ? "new" : "returning",
    receptionAt,
    reservationTime: formatDentwebReceptionTime(getDentwebRowValue(row, ["sz예약시각", "reservationTime"])),
    waitMinutes: getDentwebReceptionWaitMinutes(receptionAt, status.code),
    doctor: staffNames.get(doctorId) || "-",
    staff: staffNames.get(staffId) || "-",
    chair: chairNames.get(chairId) || "-",
    phone: normalizeMappedValue(
      getDentwebRowValue(row, ["sz휴대폰번호", "sz전화번호", "전화번호", "sz전화", "phone"]),
    ),
    detail: normalizeMappedValue(getDentwebRowValue(row, ["접수내용", "sz접수내용", "reservationDetail", "detail"])),
  };
}

async function queryDentwebTodayReception(config, date) {
  return withDentwebSqlServer(config, async ({ sql, pool }) => {
    const [receptionResult, staffResult, chairResult] = await Promise.all([
      pool.request().input("sz날짜", sql.VarChar(8), date).execute("dbo.PUB_P접수목록"),
      pool.request().query(`
        SELECT [nID] AS [id], [sz이름] AS [name]
        FROM [dbo].[PUB_V직원정보]
        WHERE ISNULL([sz퇴사일], '') = '';
      `),
      pool.request().query(`
        SELECT [nID] AS [id], [sz이름] AS [name]
        FROM [dbo].[TB_체어목록]
        ORDER BY [n순서] ASC;
      `),
    ]);
    const staffNames = new Map(
      staffResult.recordset.map((staff) => [normalizeMappedValue(staff.id), normalizeMappedValue(staff.name)]),
    );
    const chairNames = new Map(
      chairResult.recordset.map((chair) => [normalizeMappedValue(chair.id), normalizeMappedValue(chair.name)]),
    );
    const patients = receptionResult.recordset.map((row, index, rows) =>
      mapDentwebReceptionRow(row, index, rows.length, staffNames, chairNames, date),
    );

    return {
      ok: true,
      readOnly: true,
      clinicId: config.clinicId,
      date,
      patients,
      counts: patients.reduce((counts, patient) => {
        counts[patient.statusCode] = (counts[patient.statusCode] || 0) + 1;
        return counts;
      }, {}),
      checkedAt: new Date().toISOString(),
    };
  });
}

async function buildDentwebTodayReceptionPayload(config, input = {}) {
  const date = normalizeDentwebReceptionDate(input.date);
  const cacheKey = `${config.clinicId}:${date}`;
  const now = Date.now();
  const cached = dentwebReceptionCache.get(cacheKey);

  if (cached?.payload && now - cached.createdAt < dentwebReceptionCacheDurationMs) {
    return cached.payload;
  }

  if (cached?.pending) {
    return cached.pending;
  }

  const pending = queryDentwebTodayReception(config, date);
  dentwebReceptionCache.set(cacheKey, { createdAt: now, pending });

  try {
    const payload = await pending;
    dentwebReceptionCache.set(cacheKey, { createdAt: Date.now(), payload });
    return payload;
  } catch (error) {
    dentwebReceptionCache.delete(cacheKey);
    throw error;
  }
}

async function testDentwebSqlServerConnection(config) {
  return withDentwebSqlServer(config, async ({ pool }) => {
    await pool.request().query(`
      SELECT TOP (0)
        [n환자ID], [sz차트번호], [sz이름]
      FROM [dbo].[PUB_V환자정보];

      SELECT TOP (0)
        [n환자ID], [sz예약시각], [sz메모]
      FROM [dbo].[PUB_V예약정보];
    `);

    return {
      ok: true,
      readOnly: true,
      source: getDentwebSqlServerSourceLabel(config),
      message: "Dentweb SQL Server read-only views are reachable.",
      checkedAt: new Date().toISOString(),
    };
  });
}

async function loadDentwebSqlServerReadOnlyAdapter(config) {
  const sourcePath = getDentwebSqlServerSourceLabel(config);
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);
  from.setMonth(from.getMonth() - 12);
  to.setMonth(to.getMonth() + 12);
  const formatDate = (value) => value.toISOString().slice(0, 10).replace(/-/g, "");

  return withDentwebSqlServer(config, async ({ sql, pool }) => {
    const patientResult = await pool
      .request()
      .query(`
        SELECT
          patient.[n환자ID] AS [sourceId],
          patient.[sz차트번호] AS [chartNo],
          patient.[sz이름] AS [patientName],
          patient.[b성별] AS [gender],
          patient.[sz생년월일] AS [birthDate],
          COALESCE(NULLIF(patient.[sz휴대폰번호], ''), patient.[sz전화번호]) AS [phone],
          patient.[sz최종내원일] AS [lastVisitDate],
          doctor.[sz이름] AS [doctor]
        FROM [dbo].[PUB_V환자정보] AS patient
        LEFT JOIN [dbo].[PUB_V직원정보] AS doctor
          ON doctor.[nID] = patient.[n담당의사]
        WHERE ISNULL(patient.[sz차트번호], '') <> ''
          AND ISNULL(patient.[sz이름], '') <> ''
        ORDER BY patient.[n환자ID] DESC;
      `);
    const appointmentResult = await pool
      .request()
      .input("limit", sql.Int, 5000)
      .input("fromDate", sql.VarChar(8), formatDate(from))
      .input("toDate", sql.VarChar(8), formatDate(to))
      .query(`
        SELECT TOP (@limit)
          appointment.[n환자ID] AS [patientId],
          patient.[sz차트번호] AS [chartNo],
          COALESCE(NULLIF(patient.[sz이름], ''), appointment.[sz이름]) AS [patientName],
          appointment.[sz예약시각] AS [appointmentDateTime],
          appointment.[n이행현황] AS [statusCode],
          appointment.[sz예약내용] AS [appointmentNote],
          appointment.[sz메모] AS [memo],
          doctor.[sz이름] AS [doctor]
        FROM [dbo].[PUB_V예약정보] AS appointment
        LEFT JOIN [dbo].[PUB_V환자정보] AS patient
          ON patient.[n환자ID] = appointment.[n환자ID]
        LEFT JOIN [dbo].[PUB_V직원정보] AS doctor
          ON doctor.[nID] = appointment.[n담당의사]
        WHERE ISNULL(appointment.[sz예약시각], '') >= @fromDate
          AND ISNULL(appointment.[sz예약시각], '') <= @toDate
        ORDER BY appointment.[sz예약시각] DESC;
      `);

    const patients = patientResult.recordset.map((row) => ({
      sourceId: normalizeMappedValue(row.sourceId),
      chartNo: normalizeMappedValue(row.chartNo),
      patientName: normalizeMappedValue(row.patientName),
      gender: row.gender === null || row.gender === undefined ? "" : Boolean(row.gender) ? "female" : "male",
      birthDate: normalizeMappedValue(row.birthDate),
      phone: normalizeMappedValue(row.phone),
      lastVisitDate: normalizeMappedValue(row.lastVisitDate),
      doctor: normalizeMappedValue(row.doctor),
    }));
    const appointments = appointmentResult.recordset.map((row, index) => ({
      sourceId: `${normalizeMappedValue(row.patientId)}:${normalizeMappedValue(row.appointmentDateTime)}:${index}`,
      chartNo: normalizeMappedValue(row.chartNo),
      patientName: normalizeMappedValue(row.patientName),
      appointmentDate: formatDentwebAppointmentDate(row.appointmentDateTime),
      appointmentTime: formatDentwebAppointmentTime(row.appointmentDateTime),
      doctor: normalizeMappedValue(row.doctor),
      status: mapDentwebAppointmentStatus(row.statusCode),
      appointmentNote: normalizeMappedValue(row.appointmentNote),
      memo: normalizeMappedValue(row.memo),
    }));

    return {
      adapterId: "mssql_dentweb_readonly",
      sourcePath,
      sourceFiles: [sourcePath],
      patients,
      appointments,
    };
  });
}

function getLocalDbMeta(db, key) {
  const row = db.prepare("SELECT value FROM schema_meta WHERE key = ?").get(key);

  return row?.value ?? null;
}

function ensureLocalDbSchema(db, config) {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  localDbTableDefinitions.forEach((definition) => {
    db.exec(definition.createSql);
  });

  localDbIndexDefinitions.forEach((createSql) => {
    db.exec(createSql);
  });

  // A brand-new server has no schema_meta table until the definitions above
  // are applied, so the version can only be read after this point.
  const previousSchemaVersion = Number(getLocalDbMeta(db, "schema_version") ?? 0);

  const now = new Date().toISOString();

  setLocalDbMeta(db, "schema_version", localDbSchemaVersion);
  setLocalDbMeta(db, "storage_mode", "server_pc_central_db");
  setLocalDbMeta(db, "last_schema_check_at", now);

  db.prepare(`
    INSERT INTO clinics (id, name, source, created_at, updated_at)
    VALUES (?, ?, 'local_api_config', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      updated_at = excluded.updated_at
  `).run(config.clinicId, config.clinicName, now, now);

  if (previousSchemaVersion < localDbSchemaVersion) {
    queueExistingConsultationBackfill(db);
  }
}

function getLocalDb(config) {
  ensureRuntimeDir();

  const sqlite = getSqliteModule();

  if (!sqlite?.DatabaseSync) {
    return {
      db: null,
      error: "??Node.js ????????獄쏅챶留??????????ㅻ쑋??SQLite???????????????源낆┰?????????곸죩.",
    };
  }

  if (!localDb) {
    localDb = new sqlite.DatabaseSync(localDbPath);
  }

  ensureLocalDbSchema(localDb, config);

  return {
    db: localDb,
    error: null,
  };
}

function getLocalDbRowCounts(db) {
  return localDbTableDefinitions.reduce((counts, definition) => {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${definition.name}`).get();

      return {
        ...counts,
        [definition.name]: Number(row?.count ?? 0),
      };
    } catch {
      return {
        ...counts,
        [definition.name]: 0,
      };
    }
  }, {});
}

function getLastSyncRun(db, clinicId) {
  try {
    const row = db.prepare(`
      SELECT *
      FROM sync_runs
      WHERE clinic_id = ?
      ORDER BY started_at DESC
      LIMIT 1
    `).get(clinicId);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      clinicId: row.clinic_id,
      source: row.source,
      mode: row.mode,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      readOnly: Boolean(row.read_only),
      summary: row.summary_json ? JSON.parse(row.summary_json) : null,
      errorMessage: row.error_message,
    };
  } catch {
    return null;
  }
}

function getLocalDbTableColumns(db, tableName) {
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => ({
      name: column.name,
      type: column.type,
      notNull: Boolean(column.notnull),
      primaryKey: Boolean(column.pk),
      defaultValue: column.dflt_value,
    }));
  } catch {
    return [];
  }
}

function buildLocalDbSchemaPayload(config) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    return {
      ok: false,
      error: "sqlite_unavailable",
      message: error,
      db: {
        path: localDbPath,
      },
      tables: [],
    };
  }

  return {
    ok: true,
    message: "Server central DB schema is ready.",
    db: {
      path: localDbPath,
      schemaVersion: localDbSchemaVersion,
      storageMode: "server_pc_central_db",
    },
    tables: localDbTableDefinitions.map((definition) => ({
      name: definition.name,
      purpose: definition.purpose,
      columns: getLocalDbTableColumns(db, definition.name),
    })),
  };
}

function buildLocalDbStatusPayload(config) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    return {
      ok: false,
      error: "sqlite_unavailable",
      message: error,
      db: {
        path: localDbPath,
      },
      rowCounts: {},
    };
  }

  const stat = fs.existsSync(localDbPath) ? fs.statSync(localDbPath) : null;

  return {
    ok: true,
    message: "Server central DB is ready.",
    clinic: {
      id: config.clinicId,
      name: config.clinicName,
    },
    db: {
      path: localDbPath,
      exists: Boolean(stat),
      size: stat?.size ?? 0,
      modifiedAt: stat?.mtime.toISOString() ?? null,
      schemaVersion: localDbSchemaVersion,
      storageMode: "server_pc_central_db",
    },
    rowCounts: getLocalDbRowCounts(db),
    lastSyncRun: getLastSyncRun(db, config.clinicId),
    tables: localDbTableDefinitions.map((definition) => definition.name),
    checkedAt: new Date().toISOString(),
  };
}

function buildLocalDbDryRunSyncPayload(config, input = {}) {
  const statusPayload = buildLocalDbStatusPayload(config);
  const dentwebPath = sanitizeManualPath(input.dentwebPath || input.path || input.manualPath);
  const dentwebCandidate = dentwebPath ? inspectDentwebPath(dentwebPath, "dry_run_path") : null;
  const canReadDentwebPath = Boolean(dentwebCandidate?.exists && dentwebCandidate.readable);
  const plannedActions = [
    {
      step: "ensure_server_central_db",
      target: localDbPath,
      status: statusPayload.ok ? "ready" : "blocked",
      description: "???轅붽틓??????壤?PC ?????袁ⓦ걤???ш낄猷???DB ????????????????????袁ｋ쨨????쒓턁?????? ??饔낅떽???????????轅붽틓??????",
    },
    {
      step: "read_dentweb_source",
      target: dentwebPath || "not_selected",
      status: canReadDentwebPath ? "ready" : "waiting_for_readable_path",
      description: "??????諛몃마????DB/???????筌먲퐢萸?????????덇텣?????????獄쏅챶留???????????????????????耀붾굝????? ??饔낅떽???????????轅붽틓??????",
    },
    {
      step: "upsert_dentweb_snapshots",
      target: "dentweb_patients_snapshot, dentweb_appointments_snapshot",
      status: canReadDentwebPath ? "planned" : "skipped",
      description: "?????곌떽釉붾????????쒙쭫????????쒙쭫??????????轅붽틓??????壤?PC ?????袁ⓦ걤???ш낄猷???DB???????ル뒌?????????μ떜媛?걫????????筌?캉??",
    },
    {
      step: "serve_clients_from_server_db",
      target: "internal_api",
      status: "planned",
      description: "??????????源낆┸???PC?????轅붽틓??????壤?API????????????ル뒌??? ?????袁ⓦ걤???ш낄猷???DB ?????????? ????⑥ル???????????산뭐?????轅붽틓??????",
    },
  ];

  return {
    ok: statusPayload.ok,
    dryRun: true,
    readOnly: true,
    status: statusPayload.ok ? "ready" : "blocked",
    message: statusPayload.ok ? "Central DB dry-run plan is ready." : "Central DB is not ready.",
    clinic: statusPayload.clinic,
    db: statusPayload.db,
    dentweb: {
      path: dentwebPath || null,
      candidate: dentwebCandidate,
      readable: canReadDentwebPath,
    },
    rowCounts: statusPayload.rowCounts ?? {},
    plannedActions,
    warnings: [
      "????????????????????????袁ｋ쨨????쒓턁???????袁ⓦ걤?嶺뚯쉶?????렢????? dry-run????????鶯???轅붽틓??????",
      "??????諛몃마?????????DB???????????⑤벡瑜???????????? ?????????????곸죩.",
      "?????繹먮굞?????/?????얠뺏????濡る?傭?????椰?壤??????????????ш내?℡ㅇ??? ????μ떜媛?걫???????????????????API ???????癲??됀???????????????⑤벡瑜????轅붽틓??????",
    ],
    checkedAt: new Date().toISOString(),
  };
}

function pickText(source, keys, fallback = "") {
  for (const key of keys) {
    const value = source?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return fallback;
}

function safeParseJsonObject(value) {
  if (!value || typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function clampLimit(value, fallback = 10, max = 30) {
  const limit = Number(value);

  if (!Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(limit), max);
}

function escapeSqliteLikePattern(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}

function normalizeSearchText(value) {
  return String(value || "").trim();
}

function readJsonFile(filePath) {
  const rawText = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");

  return JSON.parse(rawText);
}

function findFirstExistingFile(directoryPath, fileNames) {
  for (const fileName of fileNames) {
    const candidatePath = path.join(directoryPath, fileName);

    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      return candidatePath;
    }
  }

  return "";
}

function extractArrayPayload(payload, keys) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  for (const key of keys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  return [];
}

function loadDentwebFileAdapter(sourcePath) {
  const inspectedPath = inspectDentwebPath(sourcePath, "sync_source");

  if (!inspectedPath?.exists || !inspectedPath.readable) {
    throw new Error("??????諛몃마???????????汝뷴젆?琉???????ぁ?????쇰┛?癲???????????????源낆┰?????????곸죩.");
  }

  const patientFileNames = [
    "dentweb-patients.json",
    "patients.json",
    "patient-snapshots.json",
  ];
  const appointmentFileNames = [
    "dentweb-appointments.json",
    "appointments.json",
    "appointment-snapshots.json",
  ];
  const combinedFileNames = [
    "dentweb-snapshot.json",
    "snapshot.json",
    "dentweb.json",
  ];
  let sourceFiles = [];
  let patients = [];
  let appointments = [];

  if (inspectedPath.type === "directory") {
    const combinedFilePath = findFirstExistingFile(inspectedPath.path, combinedFileNames);
    const patientFilePath = findFirstExistingFile(inspectedPath.path, patientFileNames);
    const appointmentFilePath = findFirstExistingFile(inspectedPath.path, appointmentFileNames);

    if (combinedFilePath) {
      const payload = readJsonFile(combinedFilePath);
      sourceFiles.push(combinedFilePath);
      patients = extractArrayPayload(payload, ["patients", "patientSnapshots", "dentwebPatients"]);
      appointments = extractArrayPayload(payload, ["appointments", "appointmentSnapshots", "reservations"]);
    }

    if (patientFilePath) {
      sourceFiles.push(patientFilePath);
      patients = extractArrayPayload(readJsonFile(patientFilePath), ["patients", "patientSnapshots"]);
    }

    if (appointmentFilePath) {
      sourceFiles.push(appointmentFilePath);
      appointments = extractArrayPayload(readJsonFile(appointmentFilePath), [
        "appointments",
        "appointmentSnapshots",
        "reservations",
      ]);
    }
  } else if (inspectedPath.type === "file" && inspectedPath.path.toLowerCase().endsWith(".json")) {
    const payload = readJsonFile(inspectedPath.path);
    sourceFiles.push(inspectedPath.path);
    patients = extractArrayPayload(payload, ["patients", "patientSnapshots", "dentwebPatients"]);
    appointments = extractArrayPayload(payload, ["appointments", "appointmentSnapshots", "reservations"]);
  } else {
    throw new Error("?????獄쏅챶留???????????????????JSON ?????????????????癲??됀??read-only ??????????⑤벡????耀붾굝??????????붺몭????????????곸죩.");
  }

  return {
    sourcePath: inspectedPath.path,
    sourceFiles,
    patients,
    appointments,
  };
}

function quoteSqliteIdentifier(identifier) {
  return `"${String(identifier || "").replace(/"/g, '""')}"`;
}

function normalizeMappedValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return String(value).trim();
}

function readDentwebMappedRows(sourceDb, tableMapping, allowedFields, limit) {
  if (!tableMapping?.tableName) {
    return [];
  }

  const selectedColumns = allowedFields
    .map((fieldKey) => {
      const columnName = tableMapping.columns?.[fieldKey];

      if (!columnName) {
        return null;
      }

      return `${quoteSqliteIdentifier(columnName)} AS ${quoteSqliteIdentifier(fieldKey)}`;
    })
    .filter(Boolean);

  if (selectedColumns.length === 0) {
    return [];
  }

  const rows = sourceDb
    .prepare(
      `SELECT ${selectedColumns.join(", ")}
       FROM ${quoteSqliteIdentifier(tableMapping.tableName)}
       LIMIT ?`,
    )
    .all(limit);

  return rows.map((row) =>
    allowedFields.reduce((payload, fieldKey) => {
      if (Object.prototype.hasOwnProperty.call(row, fieldKey)) {
        payload[fieldKey] = normalizeMappedValue(row[fieldKey]);
      }

      return payload;
    }, {}),
  );
}

function getSqliteSourceTableColumns(sourceDb, tableName) {
  if (!tableName) {
    return [];
  }

  try {
    return sourceDb
      .prepare(`PRAGMA table_info(${quoteSqliteIdentifier(tableName)})`)
      .all()
      .map((column) => column.name)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function countSqliteSourceRows(sourceDb, tableName) {
  if (!tableName) {
    return 0;
  }

  try {
    const row = sourceDb.prepare(`SELECT COUNT(*) AS count FROM ${quoteSqliteIdentifier(tableName)}`).get();

    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

function maskDentwebPreviewValue(fieldKey, value) {
  const text = normalizeMappedValue(value);

  if (!text) {
    return {
      hasValue: false,
      length: 0,
      preview: "-",
    };
  }

  const digits = text.replace(/[^0-9]/g, "");

  if (fieldKey === "phone") {
    return {
      hasValue: true,
      length: text.length,
      preview: digits.length >= 4 ? `***-****-${digits.slice(-4)}` : "***",
    };
  }

  if (fieldKey === "birthDate") {
    return {
      hasValue: true,
      length: text.length,
      preview: digits.length >= 6 ? `${digits.slice(0, 4)}-**-**` : "****-**-**",
    };
  }

  if (fieldKey === "appointmentDate") {
    return {
      hasValue: true,
      length: text.length,
      preview: digits.length >= 6 ? `${digits.slice(0, 4)}-**-**` : "날짜값 있음",
    };
  }

  if (fieldKey === "appointmentTime") {
    return {
      hasValue: true,
      length: text.length,
      preview: digits.length >= 2 ? `${digits.slice(0, 2)}:**` : "시간값 있음",
    };
  }

  if (fieldKey === "chartNo") {
    return {
      hasValue: true,
      length: text.length,
      preview: text.length > 2 ? `${"*".repeat(Math.max(2, text.length - 2))}${text.slice(-2)}` : "**",
    };
  }

  if (fieldKey === "patientName") {
    return {
      hasValue: true,
      length: text.length,
      preview: text.length > 1 ? `${text.slice(0, 1)}${"*".repeat(Math.min(3, text.length - 1))}` : "*",
    };
  }

  return {
    hasValue: true,
    length: text.length,
    preview: text.length > 6 ? `${text.slice(0, 2)}***${text.slice(-1)}` : `${text.slice(0, 1)}***`,
  };
}

function buildDentwebPreviewSection(sourceDb, target, tableMapping) {
  const fields = dentwebMappingFields[target];
  const labels = dentwebMappingFieldLabels[target];
  const tableName = tableMapping?.tableName || "";
  const sourceColumns = getSqliteSourceTableColumns(sourceDb, tableName);
  const sourceColumnSet = new Set(sourceColumns);
  const missingMappedColumns = fields
    .map((fieldKey) => tableMapping?.columns?.[fieldKey])
    .filter((columnName) => columnName && !sourceColumnSet.has(columnName));
  const rows =
    tableName && missingMappedColumns.length === 0
      ? readDentwebMappedRows(sourceDb, tableMapping, fields, 3)
      : [];

  return {
    tableName,
    totalRows: tableName ? countSqliteSourceRows(sourceDb, tableName) : 0,
    sampleCount: rows.length,
    mappedFields: fields.map((fieldKey) => {
      const columnName = tableMapping?.columns?.[fieldKey] || "";

      return {
        key: fieldKey,
        label: labels[fieldKey] || fieldKey,
        columnName,
        mapped: Boolean(columnName),
        columnExists: Boolean(columnName && sourceColumnSet.has(columnName)),
      };
    }),
    samples: rows.map((row, index) => ({
      rowNumber: index + 1,
      fields: fields.map((fieldKey) => ({
        key: fieldKey,
        label: labels[fieldKey] || fieldKey,
        columnName: tableMapping?.columns?.[fieldKey] || "",
        ...maskDentwebPreviewValue(fieldKey, row[fieldKey]),
      })),
    })),
    warnings: [
      ...(tableName ? [] : ["테이블이 선택되지 않았습니다."]),
      ...missingMappedColumns.map((columnName) => `선택한 컬럼을 찾을 수 없습니다: ${columnName}`),
      ...(tableName && rows.length === 0 && missingMappedColumns.length === 0
        ? ["샘플로 읽을 수 있는 행이 없습니다."]
        : []),
    ],
  };
}

function buildDentwebMappingPreviewPayload(config, input = {}) {
  const bodyMapping = normalizeDentwebSourceMapping(input.mapping);
  const savedMapping = getDentwebSourceMapping(config);
  const mapping = bodyMapping || savedMapping;

  if (!mapping) {
    return {
      ok: false,
      readOnly: true,
      error: "mapping_required",
      message: "Save or provide a Dentweb source mapping before previewing.",
      preview: null,
      checkedAt: new Date().toISOString(),
    };
  }

  const sourcePath = sanitizeManualPath(input.dentwebPath || input.path || input.manualPath || mapping.sourcePath || config.dentwebSourcePath);
  const probePayload = buildDentwebSourceProbePayload(config, { dentwebPath: sourcePath });
  const sourceFile = sanitizeManualPath(mapping.sourceFile || probePayload.selectedProbe?.evidence?.sourceFile || sourcePath);
  const inspectedPath = inspectDentwebPath(sourceFile, "mapping_preview_source");

  if (!inspectedPath?.exists || !inspectedPath.readable || inspectedPath.type !== "file") {
    return {
      ok: false,
      readOnly: true,
      error: "source_file_not_readable",
      message: "Mapped Dentweb source file is not readable.",
      sourcePath,
      sourceFile,
      preview: null,
      checkedAt: new Date().toISOString(),
    };
  }

  const sqlite = getSqliteModule();

  if (!sqlite?.DatabaseSync) {
    return {
      ok: false,
      readOnly: true,
      error: "sqlite_unavailable",
      message: "Current Node.js runtime cannot open SQLite read-only.",
      sourcePath,
      sourceFile,
      preview: null,
      checkedAt: new Date().toISOString(),
    };
  }

  let sourceDb;

  try {
    sourceDb = new sqlite.DatabaseSync(sourceFile, { readOnly: true });

    const preview = {
      patients: buildDentwebPreviewSection(sourceDb, "patients", mapping.patients),
      appointments: buildDentwebPreviewSection(sourceDb, "appointments", mapping.appointments),
    };
    const warnings = [...preview.patients.warnings, ...preview.appointments.warnings];

    return {
      ok: true,
      readOnly: true,
      message: warnings.length
        ? "Dentweb mapping preview completed with warnings."
        : "Dentweb mapping preview completed.",
      sourcePath,
      sourceFile,
      preview,
      warnings,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      readOnly: true,
      error: "preview_failed",
      message: error instanceof Error ? error.message : "Dentweb mapping preview failed.",
      sourcePath,
      sourceFile,
      preview: null,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    try {
      sourceDb?.close();
    } catch {
      // Ignore close errors during read-only preview.
    }
  }
}

function buildDentwebSyncPreflightPayload(config, input = {}) {
  const sourcePath = sanitizeManualPath(input.dentwebPath || input.path || input.manualPath || config.dentwebSourcePath);
  const probePayload = buildDentwebSourceProbePayload(config, { dentwebPath: sourcePath });
  const selectedProbe = probePayload.selectedProbe;

  if (selectedProbe?.adapterId !== "sqlite_schema_probe" || selectedProbe.status !== "schema_detected") {
    return {
      ok: true,
      readOnly: true,
      required: false,
      message: "Mapping preview is not required for this source.",
    };
  }

  const previewPayload = buildDentwebMappingPreviewPayload(config, input);
  const warnings = Array.isArray(previewPayload.warnings) ? previewPayload.warnings : [];

  if (!previewPayload.ok) {
    return {
      ...previewPayload,
      ok: false,
      required: true,
      error: previewPayload.error || "mapping_preview_failed",
      message: previewPayload.message || "Run mapping preview before read-only sync.",
    };
  }

  if (warnings.length > 0) {
    return {
      ...previewPayload,
      ok: false,
      required: true,
      error: "mapping_preview_has_warnings",
      message: "Mapping preview has warnings. Fix the mapping or confirm a clean preview before syncing.",
    };
  }

  return {
    ...previewPayload,
    ok: true,
    required: true,
    message: "Mapping preview passed. Read-only sync can continue.",
  };
}

function loadDentwebSqliteMappedAdapter(sourceFile, sourcePath, mapping) {
  const sqlite = getSqliteModule();

  if (!sqlite?.DatabaseSync) {
    throw new Error("Current Node.js runtime cannot open SQLite read-only.");
  }

  const inspectedPath = inspectDentwebPath(sourceFile, "sqlite_mapped_sync_source");

  if (!inspectedPath?.exists || !inspectedPath.readable || inspectedPath.type !== "file") {
    throw new Error("The mapped Dentweb SQLite source file is not readable.");
  }

  let sourceDb;

  try {
    sourceDb = new sqlite.DatabaseSync(inspectedPath.path, { readOnly: true });

    return {
      adapterId: "sqlite_mapped_readonly",
      sourcePath: sourcePath || inspectedPath.path,
      sourceFiles: [inspectedPath.path],
      patients: readDentwebMappedRows(sourceDb, mapping.patients, dentwebMappingFields.patients, 10000),
      appointments: readDentwebMappedRows(sourceDb, mapping.appointments, dentwebMappingFields.appointments, 10000),
    };
  } finally {
    try {
      sourceDb?.close();
    } catch {
      // Ignore close errors during read-only sync.
    }
  }
}

async function loadDentwebReadOnlyAdapter(config, sourcePath) {
  if (getDentwebSqlServerConfig(config)) {
    return loadDentwebSqlServerReadOnlyAdapter(config);
  }

  const probePayload = buildDentwebSourceProbePayload(config, { dentwebPath: sourcePath });
  const selectedProbe = probePayload.selectedProbe;

  if (selectedProbe?.adapterId === "json_snapshot" && selectedProbe.syncReady) {
    return loadDentwebFileAdapter(sourcePath);
  }

  if (selectedProbe?.adapterId === "sqlite_schema_probe" && selectedProbe.status === "schema_detected") {
    const mapping = getDentwebSourceMapping(config);
    const sourceFile = sanitizeManualPath(mapping?.sourceFile || selectedProbe.evidence?.sourceFile || sourcePath);

    if (!mapping || !sourceFile) {
      throw new Error("SQLite schema was detected. Save a patient/appointment table mapping before syncing.");
    }

    return loadDentwebSqliteMappedAdapter(sourceFile, sourcePath, mapping);
  }

  return loadDentwebFileAdapter(sourcePath);
}

function getLowerExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function readFileHeader(filePath, length = 128) {
  try {
    const descriptor = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(descriptor, buffer, 0, length, 0);

    fs.closeSync(descriptor);

    return buffer.subarray(0, bytesRead);
  } catch {
    return Buffer.alloc(0);
  }
}

function detectDentwebFileKind(filePath) {
  const extension = getLowerExtension(filePath);
  const header = readFileHeader(filePath);
  const headerText = header.toString("latin1");

  if (extension === ".json") {
    return {
      id: "json",
      label: "JSON snapshot",
      confidence: "high",
    };
  }

  if (header.toString("utf8", 0, 16) === "SQLite format 3") {
    return {
      id: "sqlite",
      label: "SQLite database",
      confidence: "high",
    };
  }

  if (extension === ".db" || extension === ".sqlite" || extension === ".sqlite3") {
    return {
      id: "sqlite_candidate",
      label: "SQLite candidate",
      confidence: "medium",
    };
  }

  if (
    extension === ".mdb" ||
    extension === ".accdb" ||
    headerText.includes("Standard Jet DB") ||
    headerText.includes("Standard ACE DB")
  ) {
    return {
      id: "access_candidate",
      label: "Microsoft Access candidate",
      confidence: extension === ".mdb" || extension === ".accdb" ? "medium" : "high",
    };
  }

  if (extension === ".fdb" || extension === ".gdb") {
    return {
      id: "firebird_candidate",
      label: "Firebird/InterBase candidate",
      confidence: "medium",
    };
  }

  return {
    id: "unknown",
    label: extension ? `${extension.slice(1).toUpperCase()} file` : "Unknown file",
    confidence: "low",
  };
}

function summarizeJsonSnapshotPayload(payload, sourceFile) {
  const patients = extractArrayPayload(payload, ["patients", "patientSnapshots", "dentwebPatients"]);
  const appointments = extractArrayPayload(payload, ["appointments", "appointmentSnapshots", "reservations"]);
  const firstPatient = patients.find((patient) => patient && typeof patient === "object");
  const firstAppointment = appointments.find((appointment) => appointment && typeof appointment === "object");

  return {
    sourceFile,
    patients: patients.length,
    appointments: appointments.length,
    patientKeys: firstPatient ? Object.keys(firstPatient).slice(0, 24) : [],
    appointmentKeys: firstAppointment ? Object.keys(firstAppointment).slice(0, 24) : [],
  };
}

function probeJsonSnapshotFile(filePath) {
  try {
    const summary = summarizeJsonSnapshotPayload(readJsonFile(filePath), filePath);
    const hasSyncArrays = summary.patients > 0 || summary.appointments > 0;

    return {
      adapterId: "json_snapshot",
      label: "JSON snapshot adapter",
      readOnly: true,
      // A generic JSON settings file is not a Dentweb export. Only mark the
      // adapter ready after the expected patient or appointment arrays exist.
      syncReady: hasSyncArrays,
      status: hasSyncArrays ? "ready" : "empty_snapshot",
      message: hasSyncArrays
        ? "JSON snapshot can be synced read-only."
        : "JSON file is valid, but patient or appointment arrays were not found.",
      evidence: summary,
    };
  } catch (error) {
    return {
      adapterId: "json_snapshot",
      label: "JSON snapshot adapter",
      readOnly: true,
      syncReady: false,
      status: "invalid_json",
      message: error instanceof Error ? error.message : "JSON file could not be parsed.",
      evidence: {
        sourceFile: filePath,
      },
    };
  }
}

function normalizeMappingText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_\-().[\]/\\]/g, "");
}

function tokenizeMappingText(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

const genericMappingKeywords = new Set(["cell", "date", "dr", "hp", "id", "name", "tel", "time", "type", "status"]);

function matchesMappingKeyword(value, keyword, options = {}) {
  const normalizedValue = normalizeMappingText(value);
  const normalizedKeyword = normalizeMappingText(keyword);
  const tokens = tokenizeMappingText(value).map((token) => normalizeMappingText(token));
  const isGenericKeyword = genericMappingKeywords.has(normalizedKeyword);

  if (!normalizedKeyword) {
    return false;
  }

  if (isGenericKeyword && !options.allowGeneric) {
    return tokens.includes(normalizedKeyword);
  }

  if (normalizedKeyword.length <= 4) {
    return tokens.includes(normalizedKeyword) || normalizedValue === normalizedKeyword;
  }

  return normalizedValue.includes(normalizedKeyword);
}

function includesAnyMappingKeyword(value, keywords, options = {}) {
  return keywords.some((keyword) => matchesMappingKeyword(value, keyword, options));
}

function findBestColumnMatch(columns, keywords, options = {}) {
  const matchedColumn = columns.find((column) => includesAnyMappingKeyword(column.name, keywords, options));

  return matchedColumn?.name || "";
}

const dentwebPatientMappingProfile = {
  label: "Patient table",
  tableKeywords: ["patient", "patients", "pat", "pt", "chart", "customer", "person", "환자", "고객", "수진", "차트"],
  fields: [
    {
      key: "chartNo",
      label: "차트번호",
      weight: 18,
      keywords: ["chart", "chartno", "chartnumber", "patientno", "ptno", "pid", "pno", "등록번호", "차트", "차트번호", "환자번호"],
    },
    {
      key: "patientName",
      label: "환자명",
      weight: 18,
      keywords: ["name", "patientname", "ptname", "pname", "custname", "성명", "이름", "환자명", "고객명"],
    },
    {
      key: "birthDate",
      label: "생년월일",
      weight: 8,
      keywords: ["birth", "birthday", "birthdate", "dob", "jumin", "resident", "생년", "생일", "주민"],
    },
    {
      key: "phone",
      label: "연락처",
      weight: 8,
      keywords: ["phone", "tel", "mobile", "cell", "hp", "contact", "전화", "핸드폰", "휴대", "연락처"],
    },
  ],
};

const dentwebAppointmentMappingProfile = {
  label: "Appointment table",
  tableKeywords: ["appointment", "appointments", "reservation", "reserve", "schedule", "booking", "visit", "rsv", "appt", "예약", "내원", "일정", "접수"],
  fields: [
    {
      key: "appointmentDate",
      label: "예약일",
      weight: 20,
      keywords: ["appointmentdate", "reservationdate", "reservedate", "visitdate", "scheduledate", "date", "ymd", "예약일", "예약일자", "내원일", "진료일", "일자"],
    },
    {
      key: "appointmentTime",
      label: "예약시간",
      weight: 8,
      keywords: ["time", "hour", "minute", "예약시간", "시간", "시각"],
    },
    {
      key: "chartNo",
      label: "차트번호",
      weight: 12,
      keywords: ["chart", "chartno", "chartnumber", "patientno", "ptno", "pid", "pno", "등록번호", "차트", "차트번호", "환자번호"],
    },
    {
      key: "patientName",
      label: "환자명",
      weight: 10,
      keywords: ["name", "patientname", "ptname", "pname", "custname", "성명", "이름", "환자명", "고객명"],
    },
    {
      key: "doctor",
      label: "담당의",
      weight: 6,
      keywords: ["doctor", "dr", "staff", "provider", "dentist", "원장", "의사", "담당"],
    },
    {
      key: "status",
      label: "상태",
      weight: 5,
      keywords: ["status", "state", "type", "예약상태", "상태", "구분"],
    },
  ],
};

function buildDentwebTableMappingSuggestions(tables, profile) {
  return tables
    .map((table) => {
      const columns = Array.isArray(table.columns) ? table.columns : [];
      const matchedColumns = {};
      const reasons = [];
      let score = 0;
      const tableNameMatched = includesAnyMappingKeyword(table.name, profile.tableKeywords, { allowGeneric: true });

      if (tableNameMatched) {
        score += 20;
        reasons.push("table_name");
      }

      profile.fields.forEach((field) => {
        const columnName = findBestColumnMatch(columns, field.keywords, { allowGeneric: tableNameMatched });

        if (columnName) {
          matchedColumns[field.key] = {
            label: field.label,
            columnName,
          };
          score += field.weight;
          reasons.push(field.key);
        }
      });

      const confidence = score >= 55 ? "high" : score >= 35 ? "medium" : score >= 18 ? "low" : "very_low";

      return {
        tableName: table.name,
        tableType: table.type,
        score,
        confidence,
        matchedColumns,
        reasons,
      };
    })
    .filter((suggestion) => suggestion.score >= 18)
    .toSorted((first, second) => second.score - first.score)
    .slice(0, 5);
}

function buildDentwebMappingSuggestions(tables) {
  return {
    patients: buildDentwebTableMappingSuggestions(tables, dentwebPatientMappingProfile),
    appointments: buildDentwebTableMappingSuggestions(tables, dentwebAppointmentMappingProfile),
  };
}

function buildDentwebSchemaReportGroup(target, profile, suggestions = []) {
  const requiredFields = profile.fields.map((field) => ({
    key: field.key,
    label: field.label,
  }));

  return {
    target,
    title: profile.label,
    requiredFields,
    candidates: suggestions.map((suggestion, index) => {
      const matchedColumnMap = suggestion.matchedColumns || {};
      const matchedFields = profile.fields
        .filter((field) => Boolean(matchedColumnMap[field.key]?.columnName))
        .map((field) => ({
          key: field.key,
          label: field.label,
          columnName: matchedColumnMap[field.key]?.columnName || "",
        }));
      const missingFields = profile.fields
        .filter((field) => !matchedColumnMap[field.key]?.columnName)
        .map((field) => ({
          key: field.key,
          label: field.label,
        }));

      return {
        tableName: suggestion.tableName,
        tableType: suggestion.tableType,
        score: suggestion.score || 0,
        confidence: suggestion.confidence || "very_low",
        recommendation: index === 0 ? "primary" : "candidate",
        matchedFieldCount: matchedFields.length,
        requiredFieldCount: requiredFields.length,
        matchRate: requiredFields.length ? Math.round((matchedFields.length / requiredFields.length) * 100) : 0,
        matchedFields,
        missingFields,
        reasons: suggestion.reasons || [],
      };
    }),
  };
}

function buildDentwebSchemaReportPayload(config, input = {}) {
  const probePayload = buildDentwebSourceProbePayload(config, input);
  const selectedProbe = probePayload.selectedProbe;
  const evidence = selectedProbe?.evidence || {};
  const tables = Array.isArray(evidence.tables) ? evidence.tables : [];
  const mappingSuggestions = evidence.mappingSuggestions || buildDentwebMappingSuggestions(tables);
  const isSqliteSchema = selectedProbe?.adapterId === "sqlite_schema_probe" && selectedProbe.status === "schema_detected";

  if (!isSqliteSchema) {
    return {
      ok: false,
      readOnly: true,
      status: selectedProbe?.syncReady ? "mapping_not_required" : "schema_report_unavailable",
      message: selectedProbe?.syncReady
        ? "This source already has a read-only sync adapter. A table mapping report is not required."
        : probePayload.message || "No SQLite schema report is available for this source.",
      sourcePath: probePayload.sourcePath || "",
      sourceFile: evidence.sourceFile || null,
      adapterId: selectedProbe?.adapterId || null,
      checkedAt: new Date().toISOString(),
      groups: [],
      tables: [],
      warnings: probePayload.warnings || [],
    };
  }

  const groups = [
    buildDentwebSchemaReportGroup("patients", dentwebPatientMappingProfile, mappingSuggestions.patients || []),
    buildDentwebSchemaReportGroup("appointments", dentwebAppointmentMappingProfile, mappingSuggestions.appointments || []),
  ];
  const warnings = [
    ...(probePayload.warnings || []),
    ...groups.flatMap((group) => (group.candidates.length ? [] : [`No ${group.target} table candidates were found.`])),
  ];

  return {
    ok: true,
    readOnly: true,
    status: "schema_report_ready",
    message: "Dentweb schema report is ready. Review candidates before saving the mapping.",
    sourcePath: probePayload.sourcePath || "",
    sourceFile: evidence.sourceFile || null,
    adapterId: selectedProbe.adapterId,
    checkedAt: new Date().toISOString(),
    tableCount: tables.length,
    columnCount: tables.reduce((total, table) => total + (Array.isArray(table.columns) ? table.columns.length : 0), 0),
    groups,
    tables: tables.slice(0, 30).map((table) => ({
      name: table.name,
      type: table.type,
      columnCount: Array.isArray(table.columns) ? table.columns.length : 0,
      columns: Array.isArray(table.columns) ? table.columns.slice(0, 16) : [],
    })),
    warnings,
  };
}

function probeSqliteSchemaFile(filePath) {
  const sqlite = getSqliteModule();

  if (!sqlite?.DatabaseSync) {
    return {
      adapterId: "sqlite_schema_probe",
      label: "SQLite schema probe",
      readOnly: true,
      syncReady: false,
      status: "sqlite_unavailable",
      message: "Current Node.js runtime cannot open SQLite for schema probing.",
      evidence: {
        sourceFile: filePath,
      },
    };
  }

  let sourceDb;

  try {
    sourceDb = new sqlite.DatabaseSync(filePath, { readOnly: true });
    const tables = sourceDb
      .prepare(
        `
          SELECT name, type
          FROM sqlite_master
          WHERE type IN ('table', 'view')
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name
          LIMIT 80
        `,
      )
      .all()
      .map((table) => {
        const safeTableName = String(table.name || "").replace(/"/g, '""');
        const columns = safeTableName
          ? sourceDb.prepare(`PRAGMA table_info("${safeTableName}")`).all().map((column) => ({
              name: column.name,
              type: column.type,
            }))
          : [];

        return {
          name: table.name,
          type: table.type,
          columns: columns.slice(0, 30),
        };
      });

    return {
      adapterId: "sqlite_schema_probe",
      label: "SQLite schema probe",
      readOnly: true,
      syncReady: false,
      status: tables.length > 0 ? "schema_detected" : "empty_schema",
      message:
        tables.length > 0
          ? "SQLite source can be opened read-only. Patient/appointment table mapping is the next step."
          : "SQLite source opened read-only, but no user tables were found.",
      evidence: {
        sourceFile: filePath,
        tables,
        mappingSuggestions: buildDentwebMappingSuggestions(tables),
      },
    };
  } catch (error) {
    return {
      adapterId: "sqlite_schema_probe",
      label: "SQLite schema probe",
      readOnly: true,
      syncReady: false,
      status: "open_failed",
      message: error instanceof Error ? error.message : "SQLite source could not be opened read-only.",
      evidence: {
        sourceFile: filePath,
      },
    };
  } finally {
    try {
      sourceDb?.close();
    } catch {
      // Ignore close errors during diagnostics.
    }
  }
}

function buildUnsupportedSourceProbe(filePath, kind) {
  const adapterHint =
    kind.id === "access_candidate"
      ? "Needs an Access/ODBC read-only adapter on the server PC."
      : kind.id === "firebird_candidate"
        ? "Needs a Firebird read-only adapter on the server PC."
        : "Needs source-specific read-only adapter mapping.";

  return {
    adapterId: kind.id,
    label: kind.label,
    readOnly: true,
    syncReady: false,
    status: "adapter_required",
    message: adapterHint,
    evidence: {
      sourceFile: filePath,
      confidence: kind.confidence,
    },
  };
}

function probeDentwebFile(filePath) {
  const kind = detectDentwebFileKind(filePath);

  if (kind.id === "json") {
    return probeJsonSnapshotFile(filePath);
  }

  if (kind.id === "sqlite" || kind.id === "sqlite_candidate") {
    return probeSqliteSchemaFile(filePath);
  }

  return buildUnsupportedSourceProbe(filePath, kind);
}

function listDentwebProbeFiles(directoryPath) {
  const files = [];
  const seenPaths = new Set();
  const candidateDirectories = [
    directoryPath,
    path.join(directoryPath, "data"),
    path.join(directoryPath, "db"),
    path.join(directoryPath, "database"),
    path.join(directoryPath, "backup"),
  ];

  const addFile = (filePath) => {
    const normalizedPath = path.normalize(filePath);
    const normalizedKey = normalizedPath.toLowerCase();

    if (seenPaths.has(normalizedKey)) {
      return;
    }

    seenPaths.add(normalizedKey);
    files.push(normalizedPath);
  };

  dentwebJsonSnapshotFileNames.forEach((fileName) => {
    candidateDirectories.forEach((directory) => addFile(path.join(directory, fileName)));
  });
  dentwebDbFileNames.forEach((fileName) => {
    candidateDirectories.forEach((directory) => addFile(path.join(directory, fileName)));
  });

  candidateDirectories.forEach((directory) => {
    try {
      fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .forEach((entry) => {
          const filePath = path.join(directory, entry.name);
          const extension = getLowerExtension(filePath);

          if (dentwebProbeFileExtensions.has(extension)) {
            addFile(filePath);
          }
        });
    } catch {
      // Ignore missing or unreadable subdirectories during safe probing.
    }
  });

  return files
    .filter((filePath) => {
      try {
        return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
      } catch {
        return false;
      }
    })
    .slice(0, 80);
}

function scoreDentwebProbe(probe) {
  if (probe.syncReady && probe.status === "ready") {
    return 100;
  }

  if (probe.adapterId === "sqlite_schema_probe" && probe.status === "schema_detected") {
    return 70;
  }

  if (probe.status === "empty_snapshot" || probe.status === "empty_schema") {
    return 50;
  }

  if (probe.status === "adapter_required") {
    return 30;
  }

  return 0;
}

function buildDentwebSourceProbePayload(config, input = {}) {
  const sourcePath = sanitizeManualPath(input.dentwebPath || input.path || input.manualPath || config.dentwebSourcePath);
  const inspectedPath = sourcePath ? inspectDentwebPath(sourcePath, "source_probe") : null;

  if (!inspectedPath) {
    return {
      ok: false,
      readOnly: true,
      status: "path_required",
      message: "Select a Dentweb source path before probing.",
      sourcePath: "",
      checkedAt: new Date().toISOString(),
      candidate: null,
      probes: [],
      selectedProbe: null,
      warnings: ["No source path was provided."],
    };
  }

  if (!inspectedPath.exists || !inspectedPath.readable) {
    return {
      ok: false,
      readOnly: true,
      status: inspectedPath.exists ? "permission_required" : "missing",
      message: inspectedPath.exists ? "Dentweb source exists but is not readable." : "Dentweb source path was not found.",
      sourcePath: inspectedPath.path,
      checkedAt: new Date().toISOString(),
      candidate: inspectedPath,
      probes: [],
      selectedProbe: null,
      warnings: [inspectedPath.message || "The source path is not ready."],
    };
  }

  const filePaths = inspectedPath.type === "directory" ? listDentwebProbeFiles(inspectedPath.path) : [inspectedPath.path];
  const probes = filePaths.map((filePath) => probeDentwebFile(filePath));
  const selectedProbe =
    probes.toSorted((first, second) => scoreDentwebProbe(second) - scoreDentwebProbe(first))[0] ?? null;
  const status = selectedProbe?.syncReady
    ? "sync_adapter_ready"
    : selectedProbe?.adapterId === "sqlite_schema_probe" && selectedProbe.status === "schema_detected"
      ? "schema_mapping_required"
      : selectedProbe
        ? "adapter_required"
        : "no_supported_files";

  return {
    ok: status !== "no_supported_files",
    readOnly: true,
    status,
    message:
      status === "sync_adapter_ready"
        ? "A read-only sync adapter is ready for this source."
        : status === "schema_mapping_required"
          ? "SQLite schema was detected. Table mapping is needed before syncing real Dentweb data."
          : status === "adapter_required"
            ? "A source was detected, but a source-specific read-only adapter is still needed."
            : "No supported Dentweb source files were found in this path.",
    sourcePath: inspectedPath.path,
    checkedAt: new Date().toISOString(),
    candidate: inspectedPath,
    probes,
    selectedProbe,
    warnings:
      status === "schema_mapping_required"
        ? ["No patient values were read. Only table and column names were inspected."]
        : status === "adapter_required"
          ? ["Do not connect write access. Add a read-only adapter after confirming the real DB format."]
          : [],
  };
}

function hashPhone(value) {
  const normalizedPhone = pickText({ value }, ["value"]).replace(/[^0-9]/g, "");

  if (!normalizedPhone) {
    return "";
  }

  return crypto.createHash("sha256").update(normalizedPhone).digest("hex");
}

function normalizeDentwebPatientSnapshot(patient, config, index) {
  const chartNo = pickText(patient, ["chartNo", "chart_no", "chartNumber", "patientNo", "PatientNo"]);
  const patientName = pickText(patient, ["patientName", "patient_name", "name", "Name"]);
  const sourceId = pickText(patient, ["id", "patientId", "patient_id", "sourceId"], chartNo || String(index + 1));
  const fallbackId = crypto
    .createHash("sha1")
    .update(`${config.clinicId}:patient:${chartNo}:${patientName}:${index}`)
    .digest("hex");

  return {
    id: `${config.clinicId}:${sourceId || fallbackId}`,
    clinicId: config.clinicId,
    chartNo,
    patientName,
    birthDate: pickText(patient, ["birthDate", "birth_date", "birthday", "BirthDate"]),
    phoneHash: hashPhone(pickText(patient, ["phone", "phoneNumber", "mobile", "tel"])),
    rawJson: JSON.stringify(patient ?? {}),
  };
}

function normalizeDentwebAppointmentSnapshot(appointment, config, index) {
  const chartNo = pickText(appointment, ["chartNo", "chart_no", "chartNumber", "patientNo", "PatientNo"]);
  const patientName = pickText(appointment, ["patientName", "patient_name", "name", "Name"]);
  const appointmentDate = pickText(appointment, [
    "appointmentDate",
    "appointment_date",
    "reservationDate",
    "date",
    "Date",
  ]);
  const sourceId = pickText(
    appointment,
    ["id", "appointmentId", "appointment_id", "reservationId", "sourceId"],
    `${chartNo}:${appointmentDate}:${index}`,
  );
  const fallbackId = crypto
    .createHash("sha1")
    .update(`${config.clinicId}:appointment:${chartNo}:${appointmentDate}:${patientName}:${index}`)
    .digest("hex");

  return {
    id: `${config.clinicId}:${sourceId || fallbackId}`,
    clinicId: config.clinicId,
    appointmentDate,
    chartNo,
    patientName,
    rawJson: JSON.stringify(appointment ?? {}),
  };
}

function startSyncRun(db, config, sourcePath) {
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO sync_runs (
      id,
      clinic_id,
      source,
      mode,
      status,
      started_at,
      read_only
    )
    VALUES (?, ?, ?, 'manual', 'running', ?, 1)
  `).run(runId, config.clinicId, sourcePath, now);

  return {
    runId,
    startedAt: now,
  };
}

function finishSyncRun(db, runId, status, summary, errorMessage = "") {
  db.prepare(`
    UPDATE sync_runs SET
      status = ?,
      finished_at = ?,
      summary_json = ?,
      error_message = ?
    WHERE id = ?
  `).run(status, new Date().toISOString(), JSON.stringify(summary ?? {}), errorMessage, runId);
}

function upsertDentwebSnapshots(db, config, adapterPayload) {
  const syncedAt = new Date().toISOString();
  const patients = adapterPayload.patients.map((patient, index) =>
    normalizeDentwebPatientSnapshot(patient, config, index),
  );
  const appointments = adapterPayload.appointments.map((appointment, index) =>
    normalizeDentwebAppointmentSnapshot(appointment, config, index),
  );

  db.exec("BEGIN");

  try {
    const patientStatement = db.prepare(`
      INSERT INTO dentweb_patients_snapshot (
        id,
        clinic_id,
        chart_no,
        patient_name,
        birth_date,
        phone_hash,
        raw_json,
        synced_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        clinic_id = excluded.clinic_id,
        chart_no = excluded.chart_no,
        patient_name = excluded.patient_name,
        birth_date = excluded.birth_date,
        phone_hash = excluded.phone_hash,
        raw_json = excluded.raw_json,
        synced_at = excluded.synced_at
    `);
    const appointmentStatement = db.prepare(`
      INSERT INTO dentweb_appointments_snapshot (
        id,
        clinic_id,
        appointment_date,
        chart_no,
        patient_name,
        raw_json,
        synced_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        clinic_id = excluded.clinic_id,
        appointment_date = excluded.appointment_date,
        chart_no = excluded.chart_no,
        patient_name = excluded.patient_name,
        raw_json = excluded.raw_json,
        synced_at = excluded.synced_at
    `);

    patients.forEach((patient) => {
      patientStatement.run(
        patient.id,
        patient.clinicId,
        patient.chartNo,
        patient.patientName,
        patient.birthDate,
        patient.phoneHash,
        patient.rawJson,
        syncedAt,
      );
    });

    appointments.forEach((appointment) => {
      appointmentStatement.run(
        appointment.id,
        appointment.clinicId,
        appointment.appointmentDate,
        appointment.chartNo,
        appointment.patientName,
        appointment.rawJson,
        syncedAt,
      );
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    appointments: appointments.length,
    patients: patients.length,
    sourceFiles: adapterPayload.sourceFiles,
    sourcePath: adapterPayload.sourcePath,
    syncedAt,
  };
}

function buildDentwebSyncStatusPayload(config) {
  const statusPayload = buildLocalDbStatusPayload(config);

  return {
    ...statusPayload,
    readOnly: true,
    sourcePath: sanitizeManualPath(config.dentwebSourcePath),
    sourceMapping: getDentwebSourceMapping(config),
  };
}

function mapDentwebAppointmentSnapshotRow(row) {
  const raw = safeParseJsonObject(row.raw_json);

  return {
    id: row.id,
    chartNo: row.chart_no || "",
    patientName: row.patient_name || "",
    appointmentDate: row.appointment_date || "",
    appointmentTime: pickText(raw, ["appointmentTime", "appointment_time", "reservationTime", "time", "Time"]),
    doctor: pickText(raw, ["doctor", "doctorName", "doctor_name", "dr", "provider", "staff"]),
    status: pickText(raw, ["status", "state", "reservationStatus", "appointmentStatus", "type"]),
    memo: pickText(raw, [
      "memo",
      "note",
      "notes",
      "remark",
      "remarks",
      "comment",
      "comments",
      "description",
      "비고",
      "메모",
      "참고",
      "예약메모",
    ]),
    syncedAt: row.synced_at || "",
  };
}

function findDentwebAppointmentsForPatient(db, clinicId, patientRow, limit = 3) {
  const chartNo = patientRow.chart_no || "";
  const patientName = patientRow.patient_name || "";

  if (!chartNo && !patientName) {
    return [];
  }

  return db
    .prepare(
      `
        SELECT id, chart_no, patient_name, appointment_date, raw_json, synced_at
        FROM dentweb_appointments_snapshot
        WHERE clinic_id = ?
          AND (
            (? <> '' AND chart_no = ?)
            OR (? <> '' AND patient_name = ?)
          )
        ORDER BY
          CASE WHEN appointment_date IS NULL OR appointment_date = '' THEN 1 ELSE 0 END,
          appointment_date DESC,
          synced_at DESC
        LIMIT ?
      `,
    )
    .all(clinicId, chartNo, chartNo, patientName, patientName, limit)
    .map(mapDentwebAppointmentSnapshotRow);
}

function findDentwebPatientVisitChannel(db, clinicId, patientRow) {
  const chartNo = patientRow.chart_no || "";
  const patientName = patientRow.patient_name || "";

  if (!chartNo && !patientName) {
    return "";
  }

  const row = db
    .prepare(
      `
        SELECT visit_channel
        FROM consultations
        WHERE clinic_id = ?
          AND COALESCE(visit_channel, '') <> ''
          AND (
            (? <> '' AND chart_no = ?)
            OR (? <> '' AND patient_name = ?)
          )
        ORDER BY consultation_date DESC, id DESC
        LIMIT 1
      `,
    )
    .get(clinicId, chartNo, chartNo, patientName, patientName);

  return row?.visit_channel || "";
}

function mapDentwebPatientSnapshotRow(db, clinicId, row) {
  const raw = safeParseJsonObject(row.raw_json);
  const appointments = findDentwebAppointmentsForPatient(db, clinicId, row, 3);

  return {
    id: row.id,
    chartNo: row.chart_no || "",
    patientName: row.patient_name || "",
    birthDate: row.birth_date || "",
    gender: pickText(raw, ["gender", "sex"]),
    phone: pickText(raw, ["phone", "mobilePhone", "phoneNumber", "mobile", "tel"]),
    visitChannel: findDentwebPatientVisitChannel(db, clinicId, row),
    hasPhoneHash: Boolean(row.phone_hash),
    latestAppointment: appointments[0] || null,
    appointments,
    memo: pickText(raw, [
      "memo",
      "note",
      "notes",
      "remark",
      "remarks",
      "comment",
      "comments",
      "description",
      "patientMemo",
      "chartMemo",
      "비고",
      "메모",
      "참고",
      "환자메모",
      "차트메모",
    ]),
    rawKeys: Object.keys(raw).slice(0, 20),
    syncedAt: row.synced_at || "",
  };
}

function buildDentwebPatientSearchPayload(config, input = {}) {
  const { db, error } = getLocalDb(config);
  const clinicId = normalizeClinicId(input.clinicId, config);
  const query = normalizeSearchText(input.q || input.query || input.keyword || input.patientName);
  const limit = clampLimit(input.limit, 10, 30);

  if (!db) {
    return {
      ok: false,
      error: "sqlite_unavailable",
      message: error,
      clinicId,
      query,
      patients: [],
      checkedAt: new Date().toISOString(),
    };
  }

  const params = [clinicId];
  const where = ["clinic_id = ?"];

  if (query) {
    const escapedQuery = escapeSqliteLikePattern(query);
    const namePrefixQuery = `${escapedQuery}%`;
    const chartLikeQuery = `%${escapedQuery}%`;

    where.push("(patient_name LIKE ? ESCAPE '\\' OR chart_no LIKE ? ESCAPE '\\')");
    params.push(namePrefixQuery, chartLikeQuery);
  }

  const rows = db
    .prepare(
      `
        SELECT id, chart_no, patient_name, birth_date, phone_hash, raw_json, synced_at
        FROM dentweb_patients_snapshot
        WHERE ${where.join(" AND ")}
        ORDER BY
          CASE
            WHEN patient_name = ? THEN 0
            WHEN patient_name LIKE ? ESCAPE '\\' THEN 1
            WHEN chart_no = ? THEN 2
            WHEN chart_no LIKE ? ESCAPE '\\' THEN 3
            ELSE 4
          END,
          synced_at DESC,
          patient_name ASC
        LIMIT ?
      `,
    )
    .all(...params, query, `${escapeSqliteLikePattern(query)}%`, query, `%${escapeSqliteLikePattern(query)}%`, limit);

  const patients = rows.map((row) => mapDentwebPatientSnapshotRow(db, clinicId, row));

  return {
    ok: true,
    readOnly: true,
    clinicId,
    query,
    limit,
    count: patients.length,
    patients,
    message: patients.length
      ? "Dentweb patient snapshots were searched from the server central DB."
      : "No Dentweb patient snapshots matched the search.",
    checkedAt: new Date().toISOString(),
  };
}

function buildDentwebPatientAppointmentsPayload(config, input = {}) {
  const { db, error } = getLocalDb(config);
  const clinicId = normalizeClinicId(input.clinicId, config);
  const patientId = normalizeSearchText(input.patientId || input.id);
  const chartNo = normalizeSearchText(input.chartNo || input.chart_no);
  const patientName = normalizeSearchText(input.patientName || input.patient_name);
  const limit = clampLimit(input.limit, 10, 50);

  if (!db) {
    return {
      ok: false,
      error: "sqlite_unavailable",
      message: error,
      clinicId,
      appointments: [],
      checkedAt: new Date().toISOString(),
    };
  }

  let target = { chart_no: chartNo, patient_name: patientName };

  if (patientId) {
    const patientRow = db
      .prepare(
        `
          SELECT id, chart_no, patient_name
          FROM dentweb_patients_snapshot
          WHERE clinic_id = ? AND id = ?
          LIMIT 1
        `,
      )
      .get(clinicId, patientId);

    if (patientRow) {
      target = patientRow;
    }
  }

  const appointments = findDentwebAppointmentsForPatient(db, clinicId, target, limit);

  return {
    ok: true,
    readOnly: true,
    clinicId,
    patientId: patientId || null,
    chartNo: target.chart_no || "",
    patientName: target.patient_name || "",
    count: appointments.length,
    appointments,
    message: appointments.length
      ? "Dentweb appointment snapshots were loaded from the server central DB."
      : "No appointment snapshots were found for this patient.",
    checkedAt: new Date().toISOString(),
  };
}

function buildDentwebSourceMappingPayload(config) {
  const mapping = getDentwebSourceMapping(config);

  return {
    ok: true,
    readOnly: true,
    configured: Boolean(mapping),
    sourcePath: sanitizeManualPath(config.dentwebSourcePath) || null,
    sourceMapping: mapping,
    message: mapping
      ? "Dentweb source mapping is saved on the server PC."
      : "Dentweb source mapping has not been saved yet.",
    checkedAt: new Date().toISOString(),
  };
}

function buildDentwebIntegrationStatusPayload(config, input = {}) {
  const statusPayload = buildLocalDbStatusPayload(config);
  const sqlServerConfig = getDentwebSqlServerConfig(config);
  const hasSqlServerPassword = Boolean(process.env.DENTWEB_SQL_PASSWORD);
  const sourcePath = sanitizeManualPath(input.dentwebPath || input.path || input.manualPath || config.dentwebSourcePath);
  const mapping = getDentwebSourceMapping(config);
  const checks = [];
  let sourceProbe = null;
  let previewPreflight = null;
  let selectedProbe = null;
  let previewRequired = false;

  checks.push({
    key: "central_db",
    label: "서버 PC 중앙 DB",
    status: statusPayload.ok ? "pass" : "block",
    message: statusPayload.ok ? "중앙 DB가 준비되어 있습니다." : statusPayload.message || "중앙 DB를 사용할 수 없습니다.",
  });

  if (sqlServerConfig) {
    checks.push({
      key: "dentweb_sql_server",
      label: "Dentweb SQL Server",
      status: "pass",
      message: `Read-only target: ${getDentwebSqlServerSourceLabel(config)}`,
    });
    checks.push({
      key: "dentweb_sql_credentials",
      label: "Read-only credentials",
      status: hasSqlServerPassword ? "pass" : "block",
      message: hasSqlServerPassword
        ? "A server-only SQL Server password is configured."
        : "Add the Dentweb SQL Server password on the server PC.",
    });

    const readyToSync = statusPayload.ok && hasSqlServerPassword;
    checks.push({
      key: "read_only_sync",
      label: "Read-only sync readiness",
      status: readyToSync ? "pass" : "wait",
      message: readyToSync
        ? "Run the SQL Server connection test before the first sync."
        : "The server-only SQL password is still required.",
    });

    return {
      ok: true,
      readOnly: true,
      readyToSync,
      status: readyToSync ? "ready_to_sync" : "action_required",
      message: readyToSync
        ? "Dentweb SQL Server integration is configured for read-only sync."
        : "Dentweb SQL Server integration needs the server-only password.",
      clinic: {
        id: config.clinicId,
        name: config.clinicName,
      },
      sourcePath: getDentwebSqlServerSourceLabel(config),
      adapterId: "mssql_dentweb_readonly",
      sourceProbeStatus: "sql_server_configured",
      mappingConfigured: false,
      previewRequired: false,
      previewClean: false,
      checks,
      warnings: [],
      checkedAt: new Date().toISOString(),
    };
  }

  if (!sourcePath) {
    checks.push({
      key: "dentweb_source_path",
      label: "덴트웹 경로",
      status: "wait",
      message: "덴트웹 DB 또는 폴더 경로를 먼저 선택해야 합니다.",
    });
  } else {
    const inspectedPath = inspectDentwebPath(sourcePath, "integration_status");

    checks.push({
      key: "dentweb_source_path",
      label: "덴트웹 경로",
      status: inspectedPath?.exists && inspectedPath.readable ? "pass" : "block",
      message:
        inspectedPath?.exists && inspectedPath.readable
          ? "덴트웹 경로를 읽기 전용으로 확인했습니다."
          : inspectedPath?.message || "덴트웹 경로를 읽을 수 없습니다.",
      target: inspectedPath?.path || sourcePath,
    });

    if (inspectedPath?.exists && inspectedPath.readable) {
      sourceProbe = buildDentwebSourceProbePayload(config, { dentwebPath: sourcePath });
      selectedProbe = sourceProbe.selectedProbe;

      checks.push({
        key: "source_probe",
        label: "소스 진단",
        status:
          sourceProbe.status === "sync_adapter_ready" || sourceProbe.status === "schema_mapping_required"
            ? "pass"
            : sourceProbe.status === "adapter_required"
              ? "warning"
              : "block",
        message: sourceProbe.message,
      });
    }
  }

  previewRequired = selectedProbe?.adapterId === "sqlite_schema_probe" && selectedProbe.status === "schema_detected";

  if (previewRequired) {
    checks.push({
      key: "source_mapping",
      label: "테이블/컬럼 매핑",
      status: mapping ? "pass" : "wait",
      message: mapping ? "저장된 덴트웹 매핑이 있습니다." : "SQLite 소스는 환자/예약 테이블 매핑이 필요합니다.",
    });

    if (mapping) {
      previewPreflight = buildDentwebSyncPreflightPayload(config, { dentwebPath: sourcePath, mapping });
      checks.push({
        key: "mapping_preview",
        label: "매핑 미리보기",
        status: previewPreflight.ok ? "pass" : "block",
        message: previewPreflight.message,
      });
    } else {
      checks.push({
        key: "mapping_preview",
        label: "매핑 미리보기",
        status: "wait",
        message: "매핑 저장 후 미리보기를 실행해야 합니다.",
      });
    }
  } else if (selectedProbe?.syncReady) {
    checks.push({
      key: "source_mapping",
      label: "테이블/컬럼 매핑",
      status: "skip",
      message: "이 소스는 별도 테이블 매핑 없이 동기화할 수 있습니다.",
    });
    checks.push({
      key: "mapping_preview",
      label: "매핑 미리보기",
      status: "skip",
      message: "이 소스는 매핑 미리보기가 필요하지 않습니다.",
    });
  }

  const readyToSync =
    statusPayload.ok &&
    Boolean(sourcePath) &&
    Boolean(selectedProbe) &&
    (selectedProbe?.syncReady || (previewRequired && Boolean(mapping) && Boolean(previewPreflight?.ok)));

  checks.push({
    key: "read_only_sync",
    label: "Read-only 동기화 준비",
    status: readyToSync ? "pass" : "wait",
    message: readyToSync
      ? "덴트웹 read-only 동기화를 실행할 수 있습니다."
      : "위 점검 항목을 먼저 완료해야 합니다.",
  });

  return {
    ok: true,
    readOnly: true,
    readyToSync,
    status: readyToSync ? "ready_to_sync" : "action_required",
    message: readyToSync
      ? "Dentweb integration is ready for read-only sync."
      : "Dentweb integration needs additional setup before sync.",
    clinic: {
      id: config.clinicId,
      name: config.clinicName,
    },
    sourcePath: sourcePath || null,
    adapterId: selectedProbe?.adapterId || null,
    sourceProbeStatus: sourceProbe?.status || null,
    mappingConfigured: Boolean(mapping),
    previewRequired,
    previewClean: Boolean(previewPreflight?.ok),
    checks,
    warnings: previewPreflight?.warnings ?? sourceProbe?.warnings ?? [],
    checkedAt: new Date().toISOString(),
  };
}

async function runDentwebReadOnlySync(config, input = {}) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    return {
      ok: false,
      error: "sqlite_unavailable",
      message: error,
      readOnly: true,
    };
  }

  const sqlServerSource = getDentwebSqlServerSourceLabel(config);
  const sourcePath =
    sqlServerSource ||
    sanitizeManualPath(input.dentwebPath || input.path || input.manualPath || config.dentwebSourcePath);

  if (!sourcePath) {
    return {
      ok: false,
      error: "source_path_required",
      message: "Configure a Dentweb SQL Server connection or select a supported read-only source before syncing.",
      readOnly: true,
      rowCounts: getLocalDbRowCounts(db),
      lastSyncRun: getLastSyncRun(db, config.clinicId),
    };
  }

  const preflightPayload = sqlServerSource
    ? { ok: true, readOnly: true, required: false, message: "SQL Server read-only adapter is configured." }
    : buildDentwebSyncPreflightPayload(config, {
        ...input,
        dentwebPath: sourcePath,
      });

  if (!preflightPayload.ok) {
    return {
      ok: false,
      error: preflightPayload.error || "mapping_preview_required",
      message: preflightPayload.message || "Run a clean mapping preview before syncing.",
      readOnly: true,
      sourcePath,
      preview: preflightPayload.preview ?? null,
      warnings: preflightPayload.warnings ?? [],
      rowCounts: getLocalDbRowCounts(db),
      lastSyncRun: getLastSyncRun(db, config.clinicId),
    };
  }

  const { runId, startedAt } = startSyncRun(db, config, sourcePath);

  try {
    const adapterPayload = await loadDentwebReadOnlyAdapter(config, sourcePath);
    const summary = upsertDentwebSnapshots(db, config, adapterPayload);
    const savedSourcePath = sqlServerSource
      ? adapterPayload.sourcePath
      : persistDentwebSourcePath(config, adapterPayload.sourcePath);

    finishSyncRun(db, runId, "success", summary);

    return {
      ok: true,
      message: "??????諛몃마????read-only ??????쒙쭫?????????????? ?????獄쏅챶留??????????????곸죩.",
      readOnly: true,
      sourcePath: savedSourcePath,
      syncRun: {
        id: runId,
        status: "success",
        startedAt,
        finishedAt: new Date().toISOString(),
        summary,
      },
      rowCounts: getLocalDbRowCounts(db),
      lastSyncRun: getLastSyncRun(db, config.clinicId),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "??????諛몃마????read-only ????????????椰??????????ㅼ뒩??????????????곸죩.";

    finishSyncRun(db, runId, "failed", { sourcePath }, message);

    return {
      ok: false,
      error: "sync_failed",
      message,
      readOnly: true,
      sourcePath,
      syncRun: {
        id: runId,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        summary: { sourcePath },
        errorMessage: message,
      },
      rowCounts: getLocalDbRowCounts(db),
      lastSyncRun: getLastSyncRun(db, config.clinicId),
    };
  }
}

function normalizeClientRecord(client) {
  const now = new Date().toISOString();
  const id = typeof client?.id === "string" && client.id.trim() ? client.id.trim() : crypto.randomUUID();
  const name =
    typeof client?.name === "string" && client.name.trim() ? client.name.trim() : "Unnamed client";
  const status = validClientStatuses.has(client?.status) ? client.status : "pending_approval";

  return {
    id,
    name,
    status,
    requestedAt: typeof client?.requestedAt === "string" ? client.requestedAt : now,
    updatedAt: typeof client?.updatedAt === "string" ? client.updatedAt : now,
    approvedAt: typeof client?.approvedAt === "string" ? client.approvedAt : undefined,
    rejectedAt: typeof client?.rejectedAt === "string" ? client.rejectedAt : undefined,
    token: typeof client?.token === "string" ? client.token : undefined,
    remoteAddress: typeof client?.remoteAddress === "string" ? client.remoteAddress : undefined,
  };
}

function readClientRecords() {
  ensureRuntimeDir();

  if (!fs.existsSync(clientsPath)) {
    return [];
  }

  try {
    const parsedClients = JSON.parse(fs.readFileSync(clientsPath, "utf8"));

    if (!Array.isArray(parsedClients)) {
      return [];
    }

    return parsedClients.map(normalizeClientRecord);
  } catch {
    return [];
  }
}

function writeClientRecords(clients) {
  ensureRuntimeDir();
  fs.writeFileSync(clientsPath, `${JSON.stringify(clients.map(normalizeClientRecord), null, 2)}\n`);
}

function toPublicClientRecord(client, options = {}) {
  return {
    id: client.id,
    name: client.name,
    status: client.status,
    requestedAt: client.requestedAt,
    updatedAt: client.updatedAt,
    approvedAt: client.approvedAt,
    rejectedAt: client.rejectedAt,
    remoteAddress: client.remoteAddress,
    hasToken: Boolean(client.token),
    ...(options.includeToken && client.token ? { token: client.token } : {}),
  };
}

function getRemoteAddress(request) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.socket.remoteAddress || "";
}

function isLoopbackRequest(request) {
  const remoteAddress = getRemoteAddress(request).replace(/^::ffff:/, "");

  return remoteAddress === "127.0.0.1" || remoteAddress === "::1";
}

function sanitizeDeviceId(value) {
  if (typeof value !== "string" || !value.trim()) {
    return crypto.randomUUID();
  }

  return value.trim().replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 100) || crypto.randomUUID();
}

function sanitizeDeviceName(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "Unnamed client";
  }

  return value.trim().slice(0, 80);
}

function sanitizeManualPath(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  return value.trim().replace(/^["']|["']$/g, "");
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((network) => network && network.family === "IPv4" && !network.internal)
    .map((network) => network.address);
}

function execFileText(file, args, timeout = 3000) {
  return new Promise((resolve) => {
    childProcess.execFile(file, args, { timeout, windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }

      resolve(stdout.toString());
    });
  });
}

async function findDentwebProcesses() {
  if (process.platform !== "win32") {
    return [];
  }

  const taskListOutput = await execFileText("tasklist.exe", ["/FO", "CSV", "/NH"]);

  return taskListOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = line
        .split(/","/)
        .map((column) => column.replace(/^"|"$/g, "").trim());

      return {
        name: columns[0] || "",
        pid: columns[1] || "",
      };
    })
    .filter((processInfo) => {
      const normalizedName = processInfo.name.toLowerCase();

      return dentwebProcessKeywords.some((keyword) => normalizedName.includes(keyword));
    });
}

function inspectDentwebPath(targetPath, source = "manual") {
  const normalizedPath = sanitizeManualPath(targetPath);

  if (!normalizedPath) {
    return null;
  }

  try {
    const stat = fs.statSync(normalizedPath);
    let readable = true;

    try {
      fs.accessSync(normalizedPath, fs.constants.R_OK);
    } catch {
      readable = false;
    }

    return {
      path: normalizedPath,
      source,
      exists: true,
      readable,
      type: stat.isDirectory() ? "directory" : "file",
      size: stat.isFile() ? stat.size : undefined,
      modifiedAt: stat.mtime.toISOString(),
      message: readable ? "Readable" : "Permission check required",
    };
  } catch {
    return {
      path: normalizedPath,
      source,
      exists: false,
      readable: false,
      type: "missing",
      message: "Path not found",
    };
  }
}

function collectDentwebPathCandidates(manualPath = "") {
  const candidates = [];
  const seenPaths = new Set();

  const addCandidate = (targetPath, source) => {
    const inspectedPath = inspectDentwebPath(targetPath, source);

    if (!inspectedPath || seenPaths.has(inspectedPath.path.toLowerCase())) {
      return;
    }

    seenPaths.add(inspectedPath.path.toLowerCase());
    candidates.push(inspectedPath);
  };

  if (manualPath) {
    addCandidate(manualPath, "manual");
  }

  getCommonDentwebPaths().forEach((candidatePath) => {
    addCandidate(candidatePath, "common_install_path");

    dentwebDbFileNames.forEach((fileName) => {
      addCandidate(path.join(candidatePath, fileName), "db_file_candidate");
      addCandidate(path.join(candidatePath, "data", fileName), "db_file_candidate");
      addCandidate(path.join(candidatePath, "db", fileName), "db_file_candidate");
      addCandidate(path.join(candidatePath, "database", fileName), "db_file_candidate");
    });
  });

  return candidates.toSorted((first, second) => {
    const firstScore = Number(first.exists) * 2 + Number(first.readable);
    const secondScore = Number(second.exists) * 2 + Number(second.readable);

    if (firstScore !== secondScore) {
      return secondScore - firstScore;
    }

    return first.path.localeCompare(second.path);
  });
}

async function buildDentwebDiscoveryPayload(manualPath = "") {
  const processes = await findDentwebProcesses();
  const candidates = collectDentwebPathCandidates(manualPath);
  const readableCandidates = candidates.filter((candidate) => candidate.exists && candidate.readable);
  const selectedCandidate = readableCandidates[0] ?? candidates.find((candidate) => candidate.exists) ?? null;
  const status = selectedCandidate?.readable
    ? "readable_candidate_found"
    : selectedCandidate?.exists
      ? "candidate_found_needs_permission"
      : processes.length > 0
        ? "process_found_path_missing"
        : "not_found";

  return {
    ok: true,
    readOnly: true,
    status,
    message:
      status === "readable_candidate_found"
        ? "??????諛몃마?????????獄쏅챶留?????汝뷴젆?琉???????ぁ?????쇰┛?癲??耀붾굝????????????????????덇텣??????????????饔낅떽?????????????????????곸죩."
        : status === "candidate_found_needs_permission"
          ? "??????諛몃마?????????獄쏅챶留?????汝뷴젆?琉???????ぁ???耀붾굝??????????????????????덇텣?????????????饔낅떽???????????????獄쏅챶留????轅붽틓??????"
          : status === "process_found_path_missing"
            ? "??????諛몃마????????????????곕츥??????????獄쏅챶留??貫????饔낅떽?????癲???耀붾굝???????????????DB/??????????獄쏅챶留?????????獄쏅챶留??癰귙룗猷??耀붾굝??????? ?耀붾굝????鶯????獒????????"
            : "Dentweb source was not found. Select a DB or export folder manually.",
    selectedCandidate,
    processes,
    candidates: candidates.slice(0, 30),
    checkedAt: new Date().toISOString(),
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Client-Token",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
  });
}

function toText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function normalizeClinicId(value, config) {
  return toText(value).trim() || config.clinicId;
}

function normalizeClinicName(value, config) {
  return toText(value).trim() || config.clinicName;
}

function getQueryClinicId(requestUrl, config) {
  return normalizeClinicId(requestUrl.searchParams.get("clinicId"), config);
}

function getHeaderText(request, headerName) {
  const headerValue = request.headers[headerName.toLowerCase()];

  if (Array.isArray(headerValue)) {
    return headerValue[0] || "";
  }

  return typeof headerValue === "string" ? headerValue : "";
}

function isLoopbackRequest(request) {
  const remoteAddress = request.socket.remoteAddress || "";

  return [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ].includes(remoteAddress);
}

function timingSafeTokenEquals(expectedToken, suppliedToken) {
  if (!expectedToken || !suppliedToken) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedToken);
  const suppliedBuffer = Buffer.from(suppliedToken);

  if (expectedBuffer.length !== suppliedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function authorizeAppDataRequest(request, response) {
  if (isLoopbackRequest(request)) {
    return true;
  }

  const deviceId = getHeaderText(request, "x-device-id").trim();
  const token = getHeaderText(request, "x-client-token").trim();
  const matchedClient = readClientRecords().find((client) => client.id === deviceId);

  if (
    matchedClient?.status === "approved" &&
    timingSafeTokenEquals(matchedClient.token || "", token)
  ) {
    return true;
  }

  sendJson(response, 401, {
    ok: false,
    error: "client_not_approved",
    message: "Client registration request was not found.",
  });

  return false;
}

function rowToConsultation(row) {
  return {
    id: Number(row.id),
    clinicId: row.clinic_id || undefined,
    clinicName: row.clinic_name || undefined,
    date: row.consultation_date || "",
    patientName: row.patient_name || "",
    chartNo: row.chart_no || "",
    patientType: row.patient_type || "new",
    counselor: row.counselor || "",
    doctor: row.doctor || "",
    visitChannel: row.visit_channel || "",
    treatmentCategory: row.treatment_category || "",
    consultedTeeth: Number(row.consulted_teeth ?? 0),
    agreedTeeth: Number(row.agreed_teeth ?? 0),
    result: row.result || "declined",
    consultationAmount: Number(row.consultation_amount ?? 0),
    agreedAmount: Number(row.agreed_amount ?? 0),
    partialAgreement: Boolean(row.partial_agreement),
    agreementCancelled: Boolean(row.agreement_cancelled),
    disagreementReason: row.disagreement_reason || undefined,
    memo: row.memo || undefined,
  };
}

function nextCentralConsultationId(db) {
  const row = db.prepare("SELECT MAX(id) AS maxId FROM consultations").get();
  const maxId = Number(row?.maxId ?? 0);

  return Math.max(100000, maxId) + 1;
}

function normalizeConsultationInput(input, config, fallback = {}) {
  const result = toText(input.result, fallback.result || "declined");
  const consultedTeeth = toNumber(input.consultedTeeth, fallback.consultedTeeth ?? 0);
  const agreedTeeth = toNumber(input.agreedTeeth, fallback.agreedTeeth ?? 0);
  const partialAgreement =
    (result === "same_day" || result === "follow_up") && consultedTeeth !== agreedTeeth ? 1 : 0;

  return {
    id: toNumber(input.id, fallback.id ?? 0),
    clinicId: normalizeClinicId(input.clinicId ?? fallback.clinicId, config),
    clinicName: toText(input.clinicName ?? fallback.clinicName, config.clinicName),
    date: toText(input.date, fallback.date || new Date().toISOString().slice(0, 10)),
    patientName: toText(input.patientName, fallback.patientName || ""),
    chartNo: toText(input.chartNo, fallback.chartNo || ""),
    patientType: toText(input.patientType, fallback.patientType || "new"),
    counselor: toText(input.counselor, fallback.counselor || ""),
    doctor: toText(input.doctor, fallback.doctor || ""),
    visitChannel: toText(input.visitChannel, fallback.visitChannel || ""),
    treatmentCategory: toText(input.treatmentCategory, fallback.treatmentCategory || ""),
    consultedTeeth,
    agreedTeeth,
    result,
    consultationAmount: toNumber(input.consultationAmount, fallback.consultationAmount ?? 0),
    agreedAmount: toNumber(input.agreedAmount, fallback.agreedAmount ?? 0),
    partialAgreement,
    agreementCancelled: result === "cancelled" ? 1 : 0,
    disagreementReason: toText(input.disagreementReason, fallback.disagreementReason || ""),
    memo: toText(input.memo, fallback.memo || ""),
  };
}

function getSupabaseServerConfig() {
  const url = String(process.env.DENTAL_CONSULT_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceRoleKey = String(process.env.DENTAL_CONSULT_SUPABASE_SERVICE_ROLE_KEY || "").trim();

  return {
    url,
    serviceRoleKey,
    configured: Boolean(url && serviceRoleKey),
  };
}

async function supabaseRequest(supabase, route, options = {}) {
  const response = await fetch(`${supabase.url}${route}`, {
    method: options.method || "GET",
    headers: {
      apikey: supabase.serviceRoleKey,
      authorization: `Bearer ${supabase.serviceRoleKey}`,
      ...(options.headers || {}),
    },
    body: options.body,
  });
  const rawBody = await response.text();
  let data = null;

  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = rawBody;
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data
        ? data.message || data.error || data.hint || JSON.stringify(data)
        : rawBody || `Supabase request failed with status ${response.status}.`;

    throw new Error(String(message).slice(0, 600));
  }

  return data;
}

function supabaseRestRoute(tableName, parameters = {}) {
  const query = new URLSearchParams(
    Object.entries(parameters).reduce((nextParameters, [key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        nextParameters[key] = String(value);
      }

      return nextParameters;
    }, {}),
  );
  const suffix = query.toString();

  return `/rest/v1/${tableName}${suffix ? `?${suffix}` : ""}`;
}

async function upsertSupabaseRow(supabase, tableName, conflictColumns, row) {
  const data = await supabaseRequest(
    supabase,
    supabaseRestRoute(tableName, { on_conflict: conflictColumns }),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([row]),
    },
  );

  const storedRow = Array.isArray(data) ? data[0] : null;

  if (!storedRow?.id) {
    throw new Error(`${tableName} did not return a stored row.`);
  }

  return storedRow;
}

async function getOrCreateSupabaseClinic(supabase, consultation) {
  const clinicKey = consultation.clinicId;
  const clinics = await supabaseRequest(
    supabase,
    supabaseRestRoute("clinics", {
      app_clinic_key: `eq.${clinicKey}`,
      select: "id,name",
      limit: 1,
    }),
  );

  if (Array.isArray(clinics) && clinics[0]?.id) {
    return clinics[0];
  }

  return upsertSupabaseRow(supabase, "clinics", "app_clinic_key", {
    app_clinic_key: clinicKey,
    name: consultation.clinicName || "Dental Consult Clinic",
  });
}

async function getSupabaseLookupId(supabase, tableName, conflictColumns, row) {
  if (!row?.name) {
    return null;
  }

  const storedRow = await upsertSupabaseRow(supabase, tableName, conflictColumns, row);

  return storedRow.id;
}

function normalizeSupabaseConsultationResult(result) {
  return ["same_day", "follow_up", "declined", "cancelled"].includes(result)
    ? result
    : "declined";
}

async function syncConsultationToSupabase(supabase, operation, consultation) {
  const clinic = await getOrCreateSupabaseClinic(supabase, consultation);

  if (operation === "delete") {
    await supabaseRequest(
      supabase,
      supabaseRestRoute("consultations", {
        clinic_id: `eq.${clinic.id}`,
        app_row_id: `eq.${consultation.id}`,
      }),
      {
        method: "DELETE",
        headers: { prefer: "return=minimal" },
      },
    );
    return;
  }

  const chartNo = consultation.chartNo || `local-${consultation.id}`;
  const patient = await upsertSupabaseRow(supabase, "patients", "clinic_id,chart_no", {
    clinic_id: clinic.id,
    name: consultation.patientName || "Unnamed patient",
    chart_no: chartNo,
    patient_type: consultation.patientType === "returning" ? "returning" : "new",
  });
  const counselorId = await getSupabaseLookupId(supabase, "staff", "clinic_id,name,staff_type", {
    clinic_id: clinic.id,
    name: consultation.counselor,
    staff_type: "counselor",
    is_active: true,
  });
  const doctorId = await getSupabaseLookupId(supabase, "staff", "clinic_id,name,staff_type", {
    clinic_id: clinic.id,
    name: consultation.doctor,
    staff_type: "doctor",
    is_active: true,
  });
  const visitChannelId = await getSupabaseLookupId(supabase, "visit_channels", "clinic_id,name", {
    clinic_id: clinic.id,
    name: consultation.visitChannel,
    is_active: true,
  });
  const treatmentCategoryId = await getSupabaseLookupId(
    supabase,
    "treatment_categories",
    "clinic_id,name",
    {
      clinic_id: clinic.id,
      name: consultation.treatmentCategory,
      is_active: true,
    },
  );
  const disagreementReasonId = await getSupabaseLookupId(
    supabase,
    "disagreement_reasons",
    "clinic_id,name",
    {
      clinic_id: clinic.id,
      name: consultation.disagreementReason,
      is_active: true,
    },
  );
  const payload = {
    clinic_id: clinic.id,
    app_row_id: consultation.id,
    patient_id: patient.id,
    consultation_date: consultation.date,
    counselor_id: counselorId,
    doctor_id: doctorId,
    visit_channel_id: visitChannelId,
    treatment_category_id: treatmentCategoryId,
    consulted_teeth_count: consultation.consultedTeeth,
    agreed_teeth_count: consultation.agreedTeeth,
    result: normalizeSupabaseConsultationResult(consultation.result),
    is_partial_treatment: Boolean(consultation.partialAgreement),
    is_cancelled_after_agreement: Boolean(consultation.agreementCancelled),
    consultation_amount: consultation.consultationAmount,
    agreed_amount: consultation.agreedAmount,
    disagreement_reason_id: disagreementReasonId,
    memo: consultation.memo || null,
  };
  const storedConsultations = await supabaseRequest(
    supabase,
    supabaseRestRoute("consultations", {
      clinic_id: `eq.${clinic.id}`,
      app_row_id: `eq.${consultation.id}`,
      select: "id",
      limit: 1,
    }),
  );

  if (Array.isArray(storedConsultations) && storedConsultations[0]?.id) {
    await supabaseRequest(
      supabase,
      supabaseRestRoute("consultations", { id: `eq.${storedConsultations[0].id}` }),
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      },
    );
    return;
  }

  await supabaseRequest(supabase, supabaseRestRoute("consultations"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify([payload]),
  });
}

function queueSupabaseConsultationSync(db, operation, consultation) {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO supabase_sync_jobs (
      id, entity_type, entity_id, clinic_id, operation, payload_json,
      attempt_count, last_error, created_at, updated_at
    )
    VALUES (?, 'consultation', ?, ?, ?, ?, 0, NULL, ?, ?)
    ON CONFLICT(entity_type, entity_id, clinic_id) DO UPDATE SET
      operation = excluded.operation,
      payload_json = excluded.payload_json,
      attempt_count = 0,
      last_error = NULL,
      updated_at = excluded.updated_at
  `).run(
    crypto.randomUUID(),
    consultation.id,
    consultation.clinicId,
    operation,
    JSON.stringify(consultation),
    now,
    now,
  );
}

function queueExistingConsultationBackfill(db) {
  const rows = db.prepare("SELECT * FROM consultations ORDER BY id ASC").all();

  rows.forEach((row) => {
    queueSupabaseConsultationSync(db, "upsert", rowToConsultation(row));
  });
}

function getSupabaseSyncStatus(config) {
  const { db } = getLocalDb(config);
  const supabase = getSupabaseServerConfig();

  if (!db) {
    return { ok: false, configured: supabase.configured, pendingJobs: 0 };
  }

  const pending = db.prepare("SELECT COUNT(*) AS count FROM supabase_sync_jobs").get();
  const latestFailure = db.prepare(`
    SELECT last_error, updated_at
    FROM supabase_sync_jobs
    WHERE last_error IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `).get();

  return {
    ok: true,
    configured: supabase.configured,
    pendingJobs: Number(pending?.count ?? 0),
    syncing: supabaseSyncInProgress,
    lastError: latestFailure?.last_error || null,
    lastErrorAt: latestFailure?.updated_at || null,
  };
}

async function syncPendingSupabaseJobs(config, limit = 20) {
  const { db, error } = getLocalDb(config);
  const supabase = getSupabaseServerConfig();

  if (!db) {
    return { ok: false, error };
  }

  if (!supabase.configured) {
    return { ok: false, error: "supabase_server_credentials_not_configured" };
  }

  if (supabaseSyncInProgress) {
    return { ok: true, syncing: true, synced: 0, failed: 0 };
  }

  supabaseSyncInProgress = true;
  let synced = 0;
  let failed = 0;

  try {
    const jobs = db.prepare(`
      SELECT *
      FROM supabase_sync_jobs
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit);

    for (const job of jobs) {
      try {
        const consultation = JSON.parse(job.payload_json);

        await syncConsultationToSupabase(supabase, job.operation, consultation);
        db.prepare("DELETE FROM supabase_sync_jobs WHERE id = ?").run(job.id);
        synced += 1;
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : "supabase_sync_failed";

        db.prepare(`
          UPDATE supabase_sync_jobs
          SET attempt_count = attempt_count + 1,
              last_error = ?,
              updated_at = ?
          WHERE id = ?
        `).run(message.slice(0, 600), new Date().toISOString(), job.id);
        failed += 1;
      }
    }
  } finally {
    supabaseSyncInProgress = false;
  }

  return { ok: failed === 0, synced, failed };
}

async function queueAndSyncConsultation(db, config, operation, consultation) {
  queueSupabaseConsultationSync(db, operation, consultation);

  return syncPendingSupabaseJobs(config, 20);
}

function insertConsultation(db, consultation) {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO consultations (
      id,
      clinic_id,
      clinic_name,
      consultation_date,
      patient_name,
      chart_no,
      patient_type,
      counselor,
      doctor,
      visit_channel,
      treatment_category,
      consulted_teeth,
      agreed_teeth,
      result,
      consultation_amount,
      agreed_amount,
      partial_agreement,
      agreement_cancelled,
      disagreement_reason,
      memo,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    consultation.id,
    consultation.clinicId,
    consultation.clinicName,
    consultation.date,
    consultation.patientName,
    consultation.chartNo,
    consultation.patientType,
    consultation.counselor,
    consultation.doctor,
    consultation.visitChannel,
    consultation.treatmentCategory,
    consultation.consultedTeeth,
    consultation.agreedTeeth,
    consultation.result,
    consultation.consultationAmount,
    consultation.agreedAmount,
    consultation.partialAgreement,
    consultation.agreementCancelled,
    consultation.disagreementReason,
    consultation.memo,
    now,
    now,
  );
}

function updateConsultationRow(db, consultation) {
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE consultations SET
      clinic_id = ?,
      clinic_name = ?,
      consultation_date = ?,
      patient_name = ?,
      chart_no = ?,
      patient_type = ?,
      counselor = ?,
      doctor = ?,
      visit_channel = ?,
      treatment_category = ?,
      consulted_teeth = ?,
      agreed_teeth = ?,
      result = ?,
      consultation_amount = ?,
      agreed_amount = ?,
      partial_agreement = ?,
      agreement_cancelled = ?,
      disagreement_reason = ?,
      memo = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    consultation.clinicId,
    consultation.clinicName,
    consultation.date,
    consultation.patientName,
    consultation.chartNo,
    consultation.patientType,
    consultation.counselor,
    consultation.doctor,
    consultation.visitChannel,
    consultation.treatmentCategory,
    consultation.consultedTeeth,
    consultation.agreedTeeth,
    consultation.result,
    consultation.consultationAmount,
    consultation.agreedAmount,
    consultation.partialAgreement,
    consultation.agreementCancelled,
    consultation.disagreementReason,
    consultation.memo,
    now,
    consultation.id,
  );
}

function getStoredConsultation(db, consultationId) {
  const row = db.prepare("SELECT * FROM consultations WHERE id = ?").get(consultationId);

  return row ? rowToConsultation(row) : null;
}

function handleConsultationsList(response, requestUrl, config) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    sendJson(response, 500, { ok: false, error: "sqlite_unavailable", message: error });
    return;
  }

  const clinicId = getQueryClinicId(requestUrl, config);
  const rows = db.prepare(`
    SELECT *
    FROM consultations
    WHERE clinic_id = ?
    ORDER BY consultation_date DESC, id DESC
  `).all(clinicId);

  sendJson(response, 200, {
    ok: true,
    clinicId,
    consultations: rows.map(rowToConsultation),
  });
}

async function handleConsultationCreate(request, response, config) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    sendJson(response, 500, { ok: false, error: "sqlite_unavailable", message: error });
    return;
  }

  const body = await readJsonBody(request);
  const consultation = normalizeConsultationInput(
    { ...body, id: Number.isFinite(Number(body.id)) ? Number(body.id) : nextCentralConsultationId(db) },
    config,
  );

  insertConsultation(db, consultation);
  const sync = await queueAndSyncConsultation(db, config, "upsert", consultation);

  sendJson(response, 201, {
    ok: true,
    consultation,
    sync,
  });
}

async function handleConsultationUpdate(request, response, config, consultationId) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    sendJson(response, 500, { ok: false, error: "sqlite_unavailable", message: error });
    return;
  }

  const currentConsultation = getStoredConsultation(db, consultationId);

  if (!currentConsultation) {
    sendJson(response, 404, {
      ok: false,
      error: "consultation_not_found",
      message: "?????繹먮굞??????????????곕툠???耀붾굝????????????????源낆┰?????????곸죩.",
    });
    return;
  }

  const body = await readJsonBody(request);
  const consultation = normalizeConsultationInput({ ...body, id: consultationId }, config, currentConsultation);

  updateConsultationRow(db, consultation);
  const sync = await queueAndSyncConsultation(db, config, "upsert", consultation);

  sendJson(response, 200, {
    ok: true,
    consultation,
    sync,
  });
}

async function handleConsultationDelete(response, config, consultationId) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    sendJson(response, 500, { ok: false, error: "sqlite_unavailable", message: error });
    return;
  }

  const currentConsultation = getStoredConsultation(db, consultationId);

  if (!currentConsultation) {
    sendJson(response, 404, {
      ok: false,
      error: "consultation_not_found",
      message: "The consultation was not found in the central DB.",
    });
    return;
  }

  const clinicId = currentConsultation.clinicId || normalizeClinicId(undefined, config);

  db.prepare("DELETE FROM recall_records WHERE consultation_id = ? AND clinic_id = ?").run(
    consultationId,
    clinicId,
  );
  db.prepare("DELETE FROM consultations WHERE id = ?").run(consultationId);
  const sync = await queueAndSyncConsultation(db, config, "delete", currentConsultation);

  sendJson(response, 200, {
    ok: true,
    consultation: currentConsultation,
    sync,
  });
}

function rowToRecallRecord(row) {
  try {
    const record = JSON.parse(row.payload_json);

    return {
      ...record,
      consultationId: Number(row.consultation_id),
    };
  } catch {
    return {
      consultationId: Number(row.consultation_id),
    };
  }
}

function handleRecallRecordsList(response, requestUrl, config) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    sendJson(response, 500, { ok: false, error: "sqlite_unavailable", message: error });
    return;
  }

  const clinicId = getQueryClinicId(requestUrl, config);
  const rows = db.prepare(`
    SELECT consultation_id, payload_json
    FROM recall_records
    WHERE clinic_id = ?
    ORDER BY updated_at DESC
  `).all(clinicId);

  sendJson(response, 200, {
    ok: true,
    clinicId,
    records: rows.map(rowToRecallRecord),
  });
}

async function handleRecallRecordUpsert(request, response, config, consultationId) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    sendJson(response, 500, { ok: false, error: "sqlite_unavailable", message: error });
    return;
  }

  const body = await readJsonBody(request);
  const clinicId = normalizeClinicId(body.clinicId, config);
  const now = new Date().toISOString();
  const record = {
    ...body,
    consultationId,
  };

  delete record.clinicId;

  db.prepare(`
    INSERT INTO recall_records (consultation_id, clinic_id, payload_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(consultation_id) DO UPDATE SET
      clinic_id = excluded.clinic_id,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(consultationId, clinicId, JSON.stringify(record), now);

  sendJson(response, 200, {
    ok: true,
    clinicId,
    record,
  });
}

async function handleRecallRecordDelete(request, response, config, consultationId, recordKey) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    sendJson(response, 500, { ok: false, error: "sqlite_unavailable", message: error });
    return;
  }

  const body = await readJsonBody(request);
  const clinicId = normalizeClinicId(body.clinicId, config);
  const row = db.prepare(`
    SELECT payload_json
    FROM recall_records
    WHERE consultation_id = ? AND clinic_id = ?
  `).get(consultationId, clinicId);

  if (!row) {
    sendJson(response, 200, { ok: true, clinicId, record: null });
    return;
  }

  let record = { consultationId };

  try {
    record = {
      ...JSON.parse(row.payload_json),
      consultationId,
    };
  } catch {
    record = { consultationId };
  }

  delete record[recordKey];

  if (record.round1 || record.round2 || record.round3 || record.final) {
    db.prepare(`
      UPDATE recall_records
      SET payload_json = ?, updated_at = ?
      WHERE consultation_id = ? AND clinic_id = ?
    `).run(JSON.stringify(record), new Date().toISOString(), consultationId, clinicId);
  } else {
    db.prepare("DELETE FROM recall_records WHERE consultation_id = ? AND clinic_id = ?").run(
      consultationId,
      clinicId,
    );
    record = null;
  }

  sendJson(response, 200, {
    ok: true,
    clinicId,
    record,
  });
}

function handleAdminSettingsGet(response, requestUrl, config) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    sendJson(response, 500, { ok: false, error: "sqlite_unavailable", message: error });
    return;
  }

  const clinicId = getQueryClinicId(requestUrl, config);
  const row = db.prepare("SELECT payload_json, updated_at FROM admin_settings WHERE clinic_id = ?").get(clinicId);
  const payload = row ? JSON.parse(row.payload_json) : null;

  sendJson(response, 200, {
    ok: true,
    clinicId,
    settings: payload,
    updatedAt: row?.updated_at ?? null,
  });
}

async function handleAdminSettingsPut(request, response, config, clinicId) {
  const { db, error } = getLocalDb(config);

  if (!db) {
    sendJson(response, 500, { ok: false, error: "sqlite_unavailable", message: error });
    return;
  }

  const body = await readJsonBody(request);
  const normalizedClinicId = normalizeClinicId(clinicId, config);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO admin_settings (clinic_id, payload_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(clinic_id) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(normalizedClinicId, JSON.stringify(body), now);

  sendJson(response, 200, {
    ok: true,
    clinicId: normalizedClinicId,
    updatedAt: now,
  });
}

function buildHealthPayload(config, startedAt) {
  return {
    ok: true,
    service: "dental-consult-crm-local-api",
    mode: config.mode,
    clinicId: config.clinicId,
    clinicName: config.clinicName,
    port: config.port,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    endpoints: [
      "/health",
      "/clinic",
      "/client/register",
      "/clients",
      "/clients/:deviceId/approve",
      "/clients/:deviceId/reject",
      "/dentweb/discover",
      "/dentweb/connection-test",
      "/dentweb/sql-server-config",
      "/dentweb/sql-server-connection-test",
      "/dentweb/source-probe",
      "/dentweb/source-mapping",
      "/dentweb/mapping-preview",
      "/dentweb/schema-report",
      "/dentweb/integration-status",
      "/dentweb/sync-status",
      "/dentweb/sync-now",
      "/dentweb/patients/search",
      "/dentweb/patients/appointments",
      "/dentweb/receptions/today",
      "/local-db/status",
      "/local-db/schema",
      "/local-db/dry-run-sync",
      "/supabase-sync/status",
      "/app-data/consultations",
      "/app-data/consultations/:id",
      "/app-data/recall-records",
      "/app-data/recall-records/:consultationId",
      "/app-data/recall-records/:consultationId/:recordKey",
      "/app-data/admin-settings",
      "/app-data/admin-settings/:clinicId",
    ],
  };
}

function buildClinicPayload(config) {
  return {
    clinic: {
      id: config.clinicId,
      name: config.clinicName,
    },
    server: {
      mode: config.mode,
      host: config.host,
      port: config.port,
      lanAddresses: getLanAddresses(),
      autoDiscoveryEnabled: Boolean(config.autoDiscoveryEnabled),
    },
    dentweb: {
      connected: Boolean(config.dentwebSourcePath),
      readOnly: true,
      sourcePath: sanitizeManualPath(config.dentwebSourcePath) || null,
      status: config.dentwebSourcePath ? "source_selected" : "not_configured",
      message: "??????諛몃마????DB ??????⑤벡瑜??? ????μ떜媛?걫??????????????????????????덇텣?????????獄쏅챶留???????????????꾨굴?????轅붽틓??????",
    },
  };
}

async function handleClientRegister(request, response, config) {
  const body = await readJsonBody(request);
  const deviceName = sanitizeDeviceName(body.deviceName);
  const deviceId = sanitizeDeviceId(body.deviceId);
  const pairingCode = typeof body.pairingCode === "string" ? body.pairingCode.replace(/[^0-9]/g, "") : "";

  if (config.pairingCode && pairingCode !== config.pairingCode) {
    sendJson(response, 401, {
      ok: false,
      error: "invalid_pairing_code",
      message: "??????⑤벡瑜?????????????諛몃마???????猷몃??? ???關?쒎첎?嫄???욱렱嶺??? ?????????????곸죩.",
    });
    return;
  }

  const clients = readClientRecords();
  const now = new Date().toISOString();
  const existingClient = clients.find((client) => client.id === deviceId);
  const nextClient = normalizeClientRecord({
    ...existingClient,
    id: deviceId,
    name: deviceName,
    status: existingClient?.status === "approved" ? "approved" : "pending_approval",
    requestedAt: existingClient?.requestedAt ?? now,
    updatedAt: now,
    rejectedAt: existingClient?.status === "approved" ? existingClient.rejectedAt : undefined,
    remoteAddress: getRemoteAddress(request),
  });
  const nextClients = existingClient
    ? clients.map((client) => (client.id === deviceId ? nextClient : client))
    : [...clients, nextClient];

  writeClientRecords(nextClients);

  sendJson(response, nextClient.status === "approved" ? 200 : 202, {
    ok: true,
    status: nextClient.status,
    device: toPublicClientRecord(nextClient, { includeToken: nextClient.status === "approved" }),
    message:
      nextClient.status === "approved"
        ? "???? ?????????????????源낆┸???饔낅떽???????곗뒧?????????곸죩. ???轅붽틓??????壤???????⑤벡瑜?????傭?끆???????????????????????????곸죩."
        : "Client registration request was received. Approval is pending on the server PC.",
  });
}

function handleSupabaseSyncStatus(response, config) {
  const payload = getSupabaseSyncStatus(config);

  sendJson(response, payload.ok ? 200 : 500, payload);
}

function handleClientsList(response) {
  const clients = readClientRecords().toSorted((first, second) => {
    const statusOrder = { pending_approval: 0, approved: 1, rejected: 2 };
    const firstOrder = statusOrder[first.status] ?? 3;
    const secondOrder = statusOrder[second.status] ?? 3;

    if (firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }

    return Date.parse(second.updatedAt) - Date.parse(first.updatedAt);
  });

  sendJson(response, 200, {
    ok: true,
    clients: clients.map((client) => toPublicClientRecord(client)),
  });
}

function handleClientDecision(response, deviceId, action) {
  const clients = readClientRecords();
  const matchedClient = clients.find((client) => client.id === deviceId);

  if (!matchedClient) {
    sendJson(response, 404, {
      ok: false,
      error: "client_not_found",
      message: "Client registration request was not found.",
    });
    return;
  }

  const now = new Date().toISOString();
  const nextClient = normalizeClientRecord({
    ...matchedClient,
    status: action === "approve" ? "approved" : "rejected",
    updatedAt: now,
    approvedAt: action === "approve" ? now : undefined,
    rejectedAt: action === "reject" ? now : undefined,
    token: action === "approve" ? matchedClient.token || crypto.randomBytes(24).toString("hex") : undefined,
  });

  writeClientRecords(clients.map((client) => (client.id === deviceId ? nextClient : client)));

  sendJson(response, 200, {
    ok: true,
    status: nextClient.status,
    device: toPublicClientRecord(nextClient, { includeToken: action === "approve" }),
    message: action === "approve" ? "Client connection was approved." : "Client connection request was rejected.",
  });
}

async function handleDentwebDiscovery(request, response) {
  const body = request.method === "POST" ? await readJsonBody(request) : {};
  const payload = await buildDentwebDiscoveryPayload(sanitizeManualPath(body.manualPath));

  sendJson(response, 200, payload);
}

async function handleDentwebConnectionTest(request, response, config) {
  const body = await readJsonBody(request);
  const manualPath = sanitizeManualPath(body.path || body.manualPath);
  const inspectedPath = inspectDentwebPath(manualPath, "manual_connection_test");

  if (!inspectedPath) {
    sendJson(response, 200, {
      ok: false,
      readOnly: true,
      status: "path_required",
      message: "Enter a Dentweb DB or folder path to test.",
      candidate: null,
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  const isReadable = inspectedPath.exists && inspectedPath.readable;

  if (isReadable) {
    persistDentwebSourcePath(config, inspectedPath.path);
  }

  sendJson(response, 200, {
    ok: isReadable,
    readOnly: true,
    status:
      isReadable
        ? "readable"
        : inspectedPath.exists
          ? "permission_required"
          : "missing",
    message:
      inspectedPath.exists && inspectedPath.readable
        ? "???????汝뷴젆?琉???????ぁ?????쇰┛?癲????????덇텣?????????獄쏅챶留???????????饔낅떽?????????????????????????곸죩."
        : inspectedPath.exists
          ? "??汝뷴젆?琉???????ぁ??????μ떜媛?걫?롪퍊?붺댚?????????덇텣?????????????饔낅떽???????????????獄쏅챶留????轅붽틓??????"
          : "Dentweb path was not found.",
    candidate: inspectedPath,
    checkedAt: new Date().toISOString(),
  });
}

async function handleDentwebSqlServerConfig(request, response, config) {
  if (request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      readOnly: true,
      ...toPublicDentwebSqlServerConfig(config),
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  if (!isLoopbackRequest(request)) {
    sendJson(response, 403, {
      ok: false,
      error: "local_server_only",
      message: "SQL Server credentials can only be configured from the server PC itself.",
    });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const saved = persistDentwebSqlServerConfig(config, body.config || body, body.password);

    sendJson(response, 200, {
      ok: true,
      readOnly: true,
      ...saved,
      message: "Dentweb SQL Server read-only configuration was saved on this server PC.",
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: "invalid_sql_server_config",
      message: error instanceof Error ? error.message : "Dentweb SQL Server configuration could not be saved.",
    });
  }
}

async function handleDentwebSqlServerConnectionTest(request, response, config) {
  try {
    const payload = await testDentwebSqlServerConnection(config);
    sendJson(response, 200, payload);
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      readOnly: true,
      error: "sql_server_connection_failed",
      message: error instanceof Error ? error.message : "Dentweb SQL Server read-only connection failed.",
      source: getDentwebSqlServerSourceLabel(config) || null,
      checkedAt: new Date().toISOString(),
    });
  }
}

async function handleDentwebSourceProbe(request, response, config) {
  const body = request.method === "POST" ? await readJsonBody(request) : {};
  const payload = buildDentwebSourceProbePayload(config, body);

  sendJson(response, payload.ok ? 200 : 400, payload);
}

async function handleDentwebSourceMapping(request, response, config) {
  if (request.method === "GET") {
    sendJson(response, 200, buildDentwebSourceMappingPayload(config));
    return;
  }

  const body = await readJsonBody(request);

  try {
    const savedMapping = persistDentwebSourceMapping(config, body.mapping || body);

    sendJson(response, 200, {
      ...buildDentwebSourceMappingPayload(config),
      sourceMapping: savedMapping,
      configured: true,
      message: "Dentweb source mapping was saved.",
    });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      readOnly: true,
      error: "invalid_source_mapping",
      message: error instanceof Error ? error.message : "Dentweb source mapping could not be saved.",
      sourceMapping: getDentwebSourceMapping(config),
    });
  }
}

async function handleDentwebMappingPreview(request, response, config) {
  const body = request.method === "POST" ? await readJsonBody(request) : {};
  const payload = buildDentwebMappingPreviewPayload(config, body);

  sendJson(response, payload.ok ? 200 : 400, payload);
}

async function handleDentwebSchemaReport(request, response, config) {
  const body = request.method === "POST" ? await readJsonBody(request) : {};
  const payload = buildDentwebSchemaReportPayload(config, body);

  sendJson(response, 200, payload);
}

async function handleDentwebIntegrationStatus(request, response, config) {
  const body = request.method === "POST" ? await readJsonBody(request) : {};
  const payload = buildDentwebIntegrationStatusPayload(config, body);

  sendJson(response, 200, payload);
}

async function handleDentwebPatientSearch(request, response, requestUrl, config) {
  const body = request.method === "POST" ? await readJsonBody(request) : {};
  const payload = buildDentwebPatientSearchPayload(config, {
    ...body,
    clinicId: body.clinicId ?? requestUrl.searchParams.get("clinicId"),
    limit: body.limit ?? requestUrl.searchParams.get("limit"),
    q: body.q ?? body.query ?? requestUrl.searchParams.get("q") ?? requestUrl.searchParams.get("query"),
  });

  sendJson(response, payload.ok ? 200 : 500, payload);
}

async function handleDentwebPatientAppointments(request, response, requestUrl, config) {
  const body = request.method === "POST" ? await readJsonBody(request) : {};
  const payload = buildDentwebPatientAppointmentsPayload(config, {
    ...body,
    chartNo: body.chartNo ?? requestUrl.searchParams.get("chartNo"),
    clinicId: body.clinicId ?? requestUrl.searchParams.get("clinicId"),
    limit: body.limit ?? requestUrl.searchParams.get("limit"),
    patientId: body.patientId ?? requestUrl.searchParams.get("patientId"),
    patientName: body.patientName ?? requestUrl.searchParams.get("patientName"),
  });

  sendJson(response, payload.ok ? 200 : 500, payload);
}

async function handleDentwebTodayReception(request, response, requestUrl, config) {
  const body = request.method === "POST" ? await readJsonBody(request) : {};

  try {
    const payload = await buildDentwebTodayReceptionPayload(config, {
      ...body,
      date: body.date ?? requestUrl.searchParams.get("date"),
    });

    sendJson(response, 200, payload);
  } catch {
    sendJson(response, 500, {
      ok: false,
      error: "dentweb_reception_unavailable",
      message: "Dentweb reception list could not be loaded.",
      checkedAt: new Date().toISOString(),
    });
  }
}

function handleLocalDbStatus(response, config) {
  const payload = buildLocalDbStatusPayload(config);

  sendJson(response, payload.ok ? 200 : 500, payload);
}

function handleLocalDbSchema(response, config) {
  const payload = buildLocalDbSchemaPayload(config);

  sendJson(response, payload.ok ? 200 : 500, payload);
}

async function handleLocalDbDryRunSync(request, response, config) {
  const body = await readJsonBody(request);
  const payload = buildLocalDbDryRunSyncPayload(config, body);

  sendJson(response, payload.ok ? 200 : 500, payload);
}

function handleDentwebSyncStatus(response, config) {
  const payload = buildDentwebSyncStatusPayload(config);

  sendJson(response, payload.ok ? 200 : 500, payload);
}

async function handleDentwebSyncNow(request, response, config) {
  const body = await readJsonBody(request);
  const payload = await runDentwebReadOnlySync(config, body);

  sendJson(response, payload.ok ? 200 : 400, payload);
}

function createServer(config, startedAt) {
  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (request.method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    try {
      if (request.method === "GET" && requestUrl.pathname === "/health") {
        sendJson(response, 200, buildHealthPayload(config, startedAt));
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/clinic") {
        sendJson(response, 200, buildClinicPayload(config));
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/client/register") {
        await handleClientRegister(request, response, config);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/clients") {
        handleClientsList(response);
        return;
      }

      if (
        (request.method === "GET" || request.method === "POST") &&
        requestUrl.pathname === "/dentweb/discover"
      ) {
        await handleDentwebDiscovery(request, response);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/dentweb/connection-test") {
        await handleDentwebConnectionTest(request, response, config);
        return;
      }

      if (
        (request.method === "GET" || request.method === "POST") &&
        requestUrl.pathname === "/dentweb/sql-server-config"
      ) {
        await handleDentwebSqlServerConfig(request, response, config);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/dentweb/sql-server-connection-test") {
        await handleDentwebSqlServerConnectionTest(request, response, config);
        return;
      }

      if (
        (request.method === "GET" || request.method === "POST") &&
        requestUrl.pathname === "/dentweb/source-probe"
      ) {
        await handleDentwebSourceProbe(request, response, config);
        return;
      }

      if (
        (request.method === "GET" || request.method === "POST") &&
        requestUrl.pathname === "/dentweb/source-mapping"
      ) {
        await handleDentwebSourceMapping(request, response, config);
        return;
      }

      if (
        (request.method === "GET" || request.method === "POST") &&
        requestUrl.pathname === "/dentweb/mapping-preview"
      ) {
        await handleDentwebMappingPreview(request, response, config);
        return;
      }

      if (
        (request.method === "GET" || request.method === "POST") &&
        requestUrl.pathname === "/dentweb/schema-report"
      ) {
        await handleDentwebSchemaReport(request, response, config);
        return;
      }

      if (
        (request.method === "GET" || request.method === "POST") &&
        requestUrl.pathname === "/dentweb/integration-status"
      ) {
        await handleDentwebIntegrationStatus(request, response, config);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/dentweb/sync-status") {
        handleDentwebSyncStatus(response, config);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/dentweb/sync-now") {
        await handleDentwebSyncNow(request, response, config);
        return;
      }

      if (
        (request.method === "GET" || request.method === "POST") &&
        requestUrl.pathname === "/dentweb/patients/search"
      ) {
        await handleDentwebPatientSearch(request, response, requestUrl, config);
        return;
      }

      if (
        (request.method === "GET" || request.method === "POST") &&
        requestUrl.pathname === "/dentweb/patients/appointments"
      ) {
        await handleDentwebPatientAppointments(request, response, requestUrl, config);
        return;
      }

      if (
        (request.method === "GET" || request.method === "POST") &&
        requestUrl.pathname === "/dentweb/receptions/today"
      ) {
        if (!authorizeAppDataRequest(request, response)) {
          return;
        }

        await handleDentwebTodayReception(request, response, requestUrl, config);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/local-db/status") {
        handleLocalDbStatus(response, config);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/local-db/schema") {
        handleLocalDbSchema(response, config);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/local-db/dry-run-sync") {
        await handleLocalDbDryRunSync(request, response, config);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/supabase-sync/status") {
        handleSupabaseSyncStatus(response, config);
        return;
      }

      if (requestUrl.pathname.startsWith("/app-data/") && !authorizeAppDataRequest(request, response)) {
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/app-data/consultations") {
        handleConsultationsList(response, requestUrl, config);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/app-data/consultations") {
        await handleConsultationCreate(request, response, config);
        return;
      }

      const consultationMatch = requestUrl.pathname.match(/^\/app-data\/consultations\/(\d+)$/);

      if (request.method === "PUT" && consultationMatch) {
        await handleConsultationUpdate(request, response, config, Number(consultationMatch[1]));
        return;
      }

      if (request.method === "DELETE" && consultationMatch) {
        await handleConsultationDelete(response, config, Number(consultationMatch[1]));
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/app-data/recall-records") {
        handleRecallRecordsList(response, requestUrl, config);
        return;
      }

      const recallRecordMatch = requestUrl.pathname.match(/^\/app-data\/recall-records\/(\d+)$/);

      if (request.method === "PUT" && recallRecordMatch) {
        await handleRecallRecordUpsert(request, response, config, Number(recallRecordMatch[1]));
        return;
      }

      const recallRecordDeleteMatch = requestUrl.pathname.match(
        /^\/app-data\/recall-records\/(\d+)\/(round1|round2|round3|final)$/,
      );

      if (request.method === "DELETE" && recallRecordDeleteMatch) {
        await handleRecallRecordDelete(
          request,
          response,
          config,
          Number(recallRecordDeleteMatch[1]),
          recallRecordDeleteMatch[2],
        );
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/app-data/admin-settings") {
        handleAdminSettingsGet(response, requestUrl, config);
        return;
      }

      const adminSettingsMatch = requestUrl.pathname.match(/^\/app-data\/admin-settings\/([^/]+)$/);

      if (request.method === "PUT" && adminSettingsMatch) {
        await handleAdminSettingsPut(request, response, config, decodeURIComponent(adminSettingsMatch[1]));
        return;
      }

      const clientDecisionMatch = requestUrl.pathname.match(/^\/clients\/([^/]+)\/(approve|reject)$/);

      if (request.method === "POST" && clientDecisionMatch) {
        handleClientDecision(response, decodeURIComponent(clientDecisionMatch[1]), clientDecisionMatch[2]);
        return;
      }

      sendJson(response, 404, {
        ok: false,
        error: "not_found",
        message: "Unsupported local API route.",
      });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: "bad_request",
        message: error instanceof Error ? error.message : "????椰?????耀붾굝????鶯ㅺ동??筌믡룓愿???? ?耀붾굝????鶯????獒????????",
      });
    }
  });
}

const startedAt = Date.now();
const config = getConfig();
const server = createServer(config, startedAt);

server.listen(config.port, config.host, () => {
  const lanAddresses = getLanAddresses();

  console.log(`Dental Consult CRM local API server is running.`);
  console.log(`Clinic: ${config.clinicName} (${config.clinicId})`);
  console.log(`Local:  http://127.0.0.1:${config.port}`);
  lanAddresses.forEach((address) => {
    console.log(`LAN:    http://${address}:${config.port}`);
  });

  void syncPendingSupabaseJobs(config, 100).then((result) => {
    if (result.synced || result.failed) {
      console.log(`Supabase sync: ${result.synced || 0} synced, ${result.failed || 0} pending retry.`);
    }
  });

  supabaseSyncTimer = setInterval(() => {
    void syncPendingSupabaseJobs(config, 100);
  }, 60_000);
});

process.on("SIGINT", () => {
  clearInterval(supabaseSyncTimer);
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  clearInterval(supabaseSyncTimer);
  server.close(() => process.exit(0));
});
