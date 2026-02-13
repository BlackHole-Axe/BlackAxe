import bcrypt from "bcrypt";
import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

// Constants
const SALT_ROUNDS = 12;
const DEFAULT_USERNAME = "blackaxe";
const DEFAULT_PASSWORD = "blackaxe";

let _db: SqlJsDatabase | null = null;
let _dbPath: string = "";
let _saveInterval: NodeJS.Timeout | null = null;
let _dbInitialized = false;

// Initialize database
export async function getDb(): Promise<SqlJsDatabase | null> {
  if (_db && _dbInitialized) return _db;
  
  try {
    const SQL = await initSqlJs();
    _dbPath = process.env.DATABASE_URL || "./data/blackaxe.db";
    
    // Ensure directory exists
    const dir = dirname(_dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    // Load existing database or create new one
    if (existsSync(_dbPath)) {
      const buffer = readFileSync(_dbPath);
      _db = new SQL.Database(buffer);
      console.log("[Database] SQLite loaded from file");
    } else {
      _db = new SQL.Database();
      console.log("[Database] SQLite created new database");
    }
    
    // Auto-save every 5 seconds
    if (_saveInterval) clearInterval(_saveInterval);
    _saveInterval = setInterval(() => {
      saveDatabase();
    }, 5000);
    
    _dbInitialized = true;
    return _db;
  } catch (error) {
    console.error("[Database] Failed to initialize:", error);
    return null;
  }
}

// Save database to file
function saveDatabase() {
  if (_db && _dbPath) {
    try {
      const data = _db.export();
      const buffer = Buffer.from(data);
      writeFileSync(_dbPath, buffer);
    } catch (error) {
      console.error("[Database] Failed to save:", error);
    }
  }
}

// Force save (call before exit)
export function forceSaveDatabase() {
  saveDatabase();
}

// Helper to run SQL and get results
function runQuery(sql: string, params: any[] = []): any[] {
  if (!_db) return [];
  try {
    const stmt = _db.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }
    const results: any[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row);
    }
    stmt.free();
    return results;
  } catch (error) {
    console.error("[Database] Query error:", sql, error);
    return [];
  }
}

// Helper to run SQL without results
function runExec(sql: string, params: any[] = []): boolean {
  if (!_db) return false;
  try {
    if (params.length > 0) {
      const stmt = _db.prepare(sql);
      stmt.bind(params);
      stmt.step();
      stmt.free();
    } else {
      _db.run(sql);
    }
    saveDatabase(); // Save after each write
    return true;
  } catch (error) {
    console.error("[Database] Exec error:", sql, error);
    return false;
  }
}

// ============ USER FUNCTIONS ============

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  createdAt: number;
  updatedAt: number;
  lastSignedIn: number;
};

export type InsertUser = {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: string;
  lastSignedIn?: Date;
};

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  await getDb();
  const results = runQuery("SELECT * FROM users WHERE openId = ?", [openId]);
  return results.length > 0 ? results[0] as User : undefined;
}

export async function getUserById(id: number): Promise<User | undefined> {
  await getDb();
  const results = runQuery("SELECT * FROM users WHERE id = ?", [id]);
  return results.length > 0 ? results[0] as User : undefined;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  await getDb();
  if (!_db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const existing = await getUserByOpenId(user.openId);
  const now = Date.now();
  
  if (existing) {
    runExec(
      "UPDATE users SET name = ?, email = ?, loginMethod = ?, role = ?, updatedAt = ?, lastSignedIn = ? WHERE openId = ?",
      [
        user.name ?? existing.name,
        user.email ?? existing.email,
        user.loginMethod ?? existing.loginMethod,
        user.role ?? existing.role,
        now,
        user.lastSignedIn ? user.lastSignedIn.getTime() : now,
        user.openId
      ]
    );
  } else {
    runExec(
      "INSERT INTO users (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        user.openId,
        user.name || null,
        user.email || null,
        user.loginMethod || null,
        user.role || "user",
        now,
        now,
        user.lastSignedIn ? user.lastSignedIn.getTime() : now
      ]
    );
  }
}

// ============ MINER FUNCTIONS ============

export type Miner = {
  id: number;
  userId: number;
  name: string;
  ipAddress: string;
  macAddress: string | null;
  minerType: string;
  model: string | null;
  firmware: string | null;
  status: string;
  hashrate: number | null;
  hashrateUnit: string | null;
  temperature: number | null;
  fanSpeed: number | null;
  power: number | null;
  voltage: number | null;
  frequency: number | null;
  poolUrl: string | null;
  poolPort: number | null;
  poolUser: string | null;
  poolPassword: string | null;
  poolUrl2: string | null;
  poolPort2: number | null;
  poolUser2: string | null;
  poolPassword2: string | null;
  poolUrl3: string | null;
  poolPort3: number | null;
  poolUser3: string | null;
  poolPassword3: string | null;
  poolStatus: string | null;
  poolLastCheckedAt: number | null;
  poolError: string | null;
  // Deep pool verification payload (JSON string).
  // Stored as a single JSON blob containing per-pool verification results.
  poolVerify: string | null;
  poolVerifyLastCheckedAt: number | null;
  sharesAccepted: number;
  sharesRejected: number;
  bestDifficulty: string | null;  // Current session best difficulty
  bestDifficultyAllTime: string | null;  // All-time best difficulty
  bestDifficultyPrevSession: string | null;  // Previous session best difficulty
  uptimeSeconds: number | null;
  tags: string | null;
  lastSeen: number | null;
  createdAt: number;
  updatedAt: number;
};

export type InsertMiner = Partial<Miner> & {
  userId: number;
  name: string;
  ipAddress: string;
};

export async function getMinersByUserId(userId: number): Promise<Miner[]> {
  await getDb();
  return runQuery("SELECT * FROM miners WHERE userId = ? ORDER BY createdAt DESC", [userId]) as Miner[];
}

export async function getMinerById(id: number): Promise<Miner | undefined> {
  await getDb();
  const results = runQuery("SELECT * FROM miners WHERE id = ?", [id]);
  return results.length > 0 ? results[0] as Miner : undefined;
}

export async function createMiner(miner: InsertMiner): Promise<Miner> {
  await getDb();
  const now = Date.now();
  const tags = Array.isArray(miner.tags) ? JSON.stringify(miner.tags) : miner.tags || null;
  
  runExec(
    `INSERT INTO miners (
      userId, name, ipAddress, macAddress, minerType, model, firmware, status,
      hashrate, hashrateUnit, temperature, fanSpeed, power, voltage, frequency,
      poolUrl, poolPort, poolUser, poolPassword,
      poolUrl2, poolPort2, poolUser2, poolPassword2,
      poolUrl3, poolPort3, poolUser3, poolPassword3,
      poolStatus, poolLastCheckedAt, poolError,
      poolVerify, poolVerifyLastCheckedAt,
      sharesAccepted, sharesRejected, bestDifficulty, bestDifficultyAllTime, bestDifficultyPrevSession, uptimeSeconds,
      apiPort,
      tags, lastSeen, createdAt, updatedAt
    )
     VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?,
      ?, ?, ?, ?
    )`,
    [
      miner.userId,
      miner.name,
      miner.ipAddress,
      miner.macAddress || null,
      miner.minerType || "other",
      miner.model || null,
      miner.firmware || null,
      miner.status || "unknown",
      miner.hashrate || 0,
      miner.hashrateUnit || "TH/s",
      miner.temperature || null,
      miner.fanSpeed || null,
      miner.power || null,
      miner.voltage || null,
      miner.frequency || null,
      miner.poolUrl || null,
      miner.poolPort ?? null,
      miner.poolUser || null,
      miner.poolPassword || null,
      miner.poolUrl2 || null,
      miner.poolPort2 ?? null,
      miner.poolUser2 || null,
      miner.poolPassword2 || null,
      miner.poolUrl3 || null,
      miner.poolPort3 ?? null,
      miner.poolUser3 || null,
      miner.poolPassword3 || null,
      miner.poolStatus || null,
      miner.poolLastCheckedAt ?? null,
      miner.poolError || null,
      (miner as any).poolVerify || null,
      (miner as any).poolVerifyLastCheckedAt ?? null,
      miner.sharesAccepted || 0,
      miner.sharesRejected || 0,
      miner.bestDifficulty || null,
      (miner as any).bestDifficultyAllTime || null,
      (miner as any).bestDifficultyPrevSession || null,
      miner.uptimeSeconds || 0,
      (miner as any).apiPort || 80,
      tags,
      miner.lastSeen || null,
      now,
      now
    ]
  );
  
  // Get the last inserted ID and return the miner
  const result = runQuery("SELECT last_insert_rowid() as id");
  const id = result.length > 0 ? result[0].id : 0;
  return (await getMinerById(id))!;
}

export async function updateMiner(id: number, updates: Partial<Miner>): Promise<Miner | undefined> {
  await getDb();
  const now = Date.now();
  const miner = await getMinerById(id);
  if (!miner) return undefined;
  
  const tags = updates.tags !== undefined 
    ? (Array.isArray(updates.tags) ? JSON.stringify(updates.tags) : updates.tags)
    : miner.tags;
  
  runExec(
    `UPDATE miners SET 
      name = ?, ipAddress = ?, macAddress = ?, minerType = ?, model = ?, firmware = ?,
      status = ?, hashrate = ?, hashrateUnit = ?, temperature = ?, fanSpeed = ?,
      power = ?, voltage = ?, frequency = ?,
      poolUrl = ?, poolPort = ?, poolUser = ?, poolPassword = ?,
      poolUrl2 = ?, poolPort2 = ?, poolUser2 = ?, poolPassword2 = ?,
      poolUrl3 = ?, poolPort3 = ?, poolUser3 = ?, poolPassword3 = ?,
      poolStatus = ?, poolLastCheckedAt = ?, poolError = ?,
      poolVerify = ?, poolVerifyLastCheckedAt = ?,
      sharesAccepted = ?, sharesRejected = ?,
      bestDifficulty = ?, bestDifficultyAllTime = ?, bestDifficultyPrevSession = ?,
      uptimeSeconds = ?,
      apiPort = ?,
      tags = ?, lastSeen = ?, updatedAt = ?
      WHERE id = ?`,
    [
      updates.name ?? miner.name,
      updates.ipAddress ?? miner.ipAddress,
      updates.macAddress ?? miner.macAddress,
      updates.minerType ?? miner.minerType,
      updates.model ?? miner.model,
      updates.firmware ?? miner.firmware,
      updates.status ?? miner.status,
      updates.hashrate ?? miner.hashrate,
      updates.hashrateUnit ?? miner.hashrateUnit,
      updates.temperature ?? miner.temperature,
      updates.fanSpeed ?? miner.fanSpeed,
      updates.power ?? miner.power,
      updates.voltage ?? miner.voltage,
      updates.frequency ?? miner.frequency,
      updates.poolUrl ?? miner.poolUrl,
      (updates.poolPort ?? (miner as any).poolPort) ?? null,
      updates.poolUser ?? miner.poolUser,
      updates.poolPassword ?? miner.poolPassword,
      (updates.poolUrl2 ?? (miner as any).poolUrl2) ?? null,
      (updates.poolPort2 ?? (miner as any).poolPort2) ?? null,
      (updates.poolUser2 ?? (miner as any).poolUser2) ?? null,
      (updates.poolPassword2 ?? (miner as any).poolPassword2) ?? null,
      (updates.poolUrl3 ?? (miner as any).poolUrl3) ?? null,
      (updates.poolPort3 ?? (miner as any).poolPort3) ?? null,
      (updates.poolUser3 ?? (miner as any).poolUser3) ?? null,
      (updates.poolPassword3 ?? (miner as any).poolPassword3) ?? null,
      (updates.poolStatus ?? (miner as any).poolStatus) ?? null,
      (updates.poolLastCheckedAt ?? (miner as any).poolLastCheckedAt) ?? null,
      (updates.poolError ?? (miner as any).poolError) ?? null,
      (updates as any).poolVerify ?? (miner as any).poolVerify ?? null,
      ((updates as any).poolVerifyLastCheckedAt ?? (miner as any).poolVerifyLastCheckedAt) ?? null,
      updates.sharesAccepted ?? miner.sharesAccepted,
      updates.sharesRejected ?? miner.sharesRejected,
      updates.bestDifficulty ?? miner.bestDifficulty,
      (updates as any).bestDifficultyAllTime ?? (miner as any).bestDifficultyAllTime,
      (updates as any).bestDifficultyPrevSession ?? (miner as any).bestDifficultyPrevSession,
      updates.uptimeSeconds ?? miner.uptimeSeconds,
      (updates as any).apiPort ?? (miner as any).apiPort ?? 80,
      tags,
      updates.lastSeen ?? miner.lastSeen,
      now,
      id
    ]
  );
  
  return getMinerById(id);
}

export async function deleteMiner(id: number): Promise<void> {
  await getDb();
  runExec("DELETE FROM miners WHERE id = ?", [id]);
  runExec("DELETE FROM minerStats WHERE minerId = ?", [id]);
  runExec("DELETE FROM alerts WHERE minerId = ?", [id]);
  runExec("DELETE FROM minerLogs WHERE minerId = ?", [id]);
}

// ============ MINER STATS FUNCTIONS ============

export type MinerStats = {
  id: number;
  minerId: number;
  hashrate: number | null;
  temperature: number | null;
  fanSpeed: number | null;
  power: number | null;
  voltage: number | null;
  frequency: number | null;
  sharesAccepted: number | null;
  sharesRejected: number | null;
  uptime: number | null;
  efficiency: number | null;
  recordedAt: number;
};

export async function getMinerStatsHistory(minerId: number, hours: number = 24): Promise<MinerStats[]> {
  await getDb();
  const cutoff = Date.now() - (hours * 60 * 60 * 1000);
  return runQuery(
    "SELECT * FROM minerStats WHERE minerId = ? AND recordedAt > ? ORDER BY recordedAt ASC",
    [minerId, cutoff]
  ) as MinerStats[];
}

export async function recordMinerStats(stats: {
  minerId: number;
  hashrate: number;
  temperature: number | null;
  fanSpeed: number | null;
  power: number | null;
  voltage?: number | null;
  frequency?: number | null;
  sharesAccepted: number;
  sharesRejected: number;
}): Promise<void> {
  await getDb();
  const now = Date.now();
  runExec(
    "INSERT INTO minerStats (minerId, hashrate, temperature, fanSpeed, power, voltage, frequency, sharesAccepted, sharesRejected, recordedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [stats.minerId, stats.hashrate, stats.temperature, stats.fanSpeed, stats.power, stats.voltage || null, stats.frequency || null, stats.sharesAccepted, stats.sharesRejected, now]
  );
}

// ============ ALERT FUNCTIONS ============

export type Alert = {
  id: number;
  userId: number;
  minerId: number | null;
  alertType: string;
  severity: string;
  title: string;
  message: string | null;
  isRead: number;
  isAcknowledged: number;
  acknowledgedAt: number | null;
  metadata: string | null;
  createdAt: number;
};

export type InsertAlert = {
  userId: number;
  minerId?: number | null;
  alertType: string;
  severity?: string;
  title: string;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

export async function getAlertsByUserId(userId: number, limit = 50): Promise<Alert[]> {
  await getDb();
  return runQuery("SELECT * FROM alerts WHERE userId = ? ORDER BY createdAt DESC LIMIT ?", [userId, limit]) as Alert[];
}

export async function getUnreadAlerts(userId: number): Promise<Alert[]> {
  await getDb();
  return runQuery("SELECT * FROM alerts WHERE userId = ? AND isRead = 0 ORDER BY createdAt DESC", [userId]) as Alert[];
}

export async function getUnreadAlertsCount(userId: number): Promise<number> {
  await getDb();
  const result = runQuery("SELECT COUNT(*) as count FROM alerts WHERE userId = ? AND isRead = 0", [userId]);
  return result.length > 0 ? result[0].count : 0;
}

export async function createAlert(alert: InsertAlert): Promise<Alert> {
  await getDb();
  const now = Date.now();
  runExec(
    "INSERT INTO alerts (userId, minerId, alertType, severity, title, message, isRead, isAcknowledged, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)",
    [
      alert.userId,
      alert.minerId || null,
      alert.alertType,
      alert.severity || "warning",
      alert.title,
      alert.message || null,
      alert.metadata ? JSON.stringify(alert.metadata) : null,
      now
    ]
  );
  const result = runQuery("SELECT last_insert_rowid() as id");
  const id = result.length > 0 ? result[0].id : 0;
  const alerts = runQuery("SELECT * FROM alerts WHERE id = ?", [id]);
  return alerts[0] as Alert;
}

export async function markAlertAsRead(id: number): Promise<void> {
  await getDb();
  runExec("UPDATE alerts SET isRead = 1 WHERE id = ?", [id]);
}

export async function acknowledgeAlert(id: number): Promise<void> {
  await getDb();
  const now = Date.now();
  runExec("UPDATE alerts SET isAcknowledged = 1, acknowledgedAt = ? WHERE id = ?", [now, id]);
}

export async function markAllAlertsAsRead(userId: number): Promise<void> {
  await getDb();
  runExec("UPDATE alerts SET isRead = 1 WHERE userId = ?", [userId]);
}

export async function deleteAlert(id: number): Promise<void> {
  await getDb();
  runExec("DELETE FROM alerts WHERE id = ?", [id]);
}

// ============ USER SETTINGS FUNCTIONS ============

export type UserSettings = {
  id: number;
  userId: number;
  tempWarningThreshold: number;
  tempCriticalThreshold: number;
  hashrateDropThreshold: number;
  offlineAlertDelay: number;
  fanWarningBelowRpm: number;
  fanCriticalBelowRpm: number;
  pushNotifications: number;
  emailNotifications: number;
  blockFoundNotifications: number;
  hashrateUnit: string;
  temperatureUnit: string;
  refreshInterval: number;
  autoScanEnabled: number;
  autoScanInterval: number;
  scanSubnet: string;
  poolProfilesJson: string;
  createdAt: number;
  updatedAt: number;
};

export async function getUserSettings(userId: number): Promise<UserSettings | null> {
  await getDb();
  const results = runQuery("SELECT * FROM userSettings WHERE userId = ?", [userId]);
  if (results.length === 0) {
    // Create default settings
    const now = Date.now();
    runExec(
      `INSERT INTO userSettings (
        userId, tempWarningThreshold, tempCriticalThreshold, hashrateDropThreshold, offlineAlertDelay,
        fanWarningBelowRpm, fanCriticalBelowRpm,
        pushNotifications, emailNotifications, blockFoundNotifications,
        hashrateUnit, temperatureUnit, refreshInterval,
        autoScanEnabled, autoScanInterval, scanSubnet, poolProfilesJson,
        createdAt, updatedAt
      )
       VALUES (?, 70, 80, 20, 300, 1000, 500, 1, 0, 1, 'TH/s', 'C', 3, 0, 3600, '192.168.1.0/24', '{}', ?, ?)`,
      [userId, now, now]
    );
    return getUserSettings(userId);
  }
  return results[0] as UserSettings;
}

export async function upsertUserSettings(userId: number, settings: Partial<UserSettings>): Promise<UserSettings | null> {
  await getDb();
  const existing = await getUserSettings(userId);
  if (!existing) return null;
  
  const now = Date.now();
  runExec(
    `UPDATE userSettings SET 
      tempWarningThreshold = ?, tempCriticalThreshold = ?, hashrateDropThreshold = ?,
      offlineAlertDelay = ?, fanWarningBelowRpm = ?, fanCriticalBelowRpm = ?,
      pushNotifications = ?, emailNotifications = ?,
      blockFoundNotifications = ?, hashrateUnit = ?, temperatureUnit = ?,
      refreshInterval = ?, autoScanEnabled = ?, autoScanInterval = ?,
      scanSubnet = ?, poolProfilesJson = ?, updatedAt = ?
     WHERE userId = ?`,
    [
      settings.tempWarningThreshold ?? existing.tempWarningThreshold,
      settings.tempCriticalThreshold ?? existing.tempCriticalThreshold,
      settings.hashrateDropThreshold ?? existing.hashrateDropThreshold,
      settings.offlineAlertDelay ?? existing.offlineAlertDelay,
      settings.fanWarningBelowRpm ?? existing.fanWarningBelowRpm,
      settings.fanCriticalBelowRpm ?? existing.fanCriticalBelowRpm,
      settings.pushNotifications !== undefined ? (settings.pushNotifications ? 1 : 0) : existing.pushNotifications,
      settings.emailNotifications !== undefined ? (settings.emailNotifications ? 1 : 0) : existing.emailNotifications,
      settings.blockFoundNotifications !== undefined ? (settings.blockFoundNotifications ? 1 : 0) : existing.blockFoundNotifications,
      settings.hashrateUnit ?? existing.hashrateUnit,
      settings.temperatureUnit ?? existing.temperatureUnit,
      settings.refreshInterval ?? existing.refreshInterval,
      settings.autoScanEnabled !== undefined ? (settings.autoScanEnabled ? 1 : 0) : existing.autoScanEnabled,
      settings.autoScanInterval ?? existing.autoScanInterval,
      settings.scanSubnet ?? existing.scanSubnet,
      settings.poolProfilesJson ?? existing.poolProfilesJson ?? "{}",
      now,
      userId
    ]
  );
  
  return getUserSettings(userId);
}

// ============ SOLO BLOCKS FUNCTIONS ============

export type SoloBlock = {
  id: number;
  blockHeight: number;
  blockHash: string | null;
  poolName: string;
  poolUrl: string | null;
  minerAddress: string | null;
  reward: number | null;
  difficulty: string | null;
  localMinerId: number | null;
  localMinerName: string | null;
  isLocalFind: number;
  timestamp: number;
  createdAt: number;
};

export async function getRecentSoloBlocks(limit: number = 20): Promise<SoloBlock[]> {
  await getDb();
  return runQuery("SELECT * FROM soloBlocks ORDER BY timestamp DESC LIMIT ?", [limit]) as SoloBlock[];
}

export async function addSoloBlock(block: {
  blockHeight: number;
  blockHash: string;
  poolName: string;
  poolUrl?: string;
  minerAddress?: string;
  reward: number;
  difficulty?: string;
  localMinerId?: number;
  localMinerName?: string;
  isLocalFind?: boolean;
  timestamp: Date;
}): Promise<SoloBlock> {
  await getDb();
  const now = Date.now();
  runExec(
    `INSERT INTO soloBlocks (blockHeight, blockHash, poolName, poolUrl, minerAddress, reward, difficulty, localMinerId, localMinerName, isLocalFind, timestamp, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      block.blockHeight,
      block.blockHash,
      block.poolName,
      block.poolUrl || null,
      block.minerAddress || null,
      block.reward,
      block.difficulty || null,
      block.localMinerId || null,
      block.localMinerName || null,
      block.isLocalFind ? 1 : 0,
      block.timestamp.getTime(),
      now
    ]
  );
  const result = runQuery("SELECT last_insert_rowid() as id");
  const id = result.length > 0 ? result[0].id : 0;
  const blocks = runQuery("SELECT * FROM soloBlocks WHERE id = ?", [id]);
  return blocks[0] as SoloBlock;
}

// ============ DASHBOARD STATS FUNCTIONS ============

export type DashboardStats = {
  totalMiners: number;
  onlineMiners: number;
  offlineMiners: number;
  warningMiners: number;
  totalHashrate: number;
  avgTemperature: number;
  totalPower: number;
  totalSharesAccepted: number;
  totalSharesRejected: number;
  unreadAlerts: number;
};

export async function getDashboardStats(userId: number): Promise<DashboardStats> {
  await getDb();
  
  const miners = runQuery("SELECT * FROM miners WHERE userId = ?", [userId]) as Miner[];
  const unreadCount = await getUnreadAlertsCount(userId);
  
  const onlineMiners = miners.filter(m => m.status === 'online');
  const offlineMiners = miners.filter(m => m.status === 'offline');
  const warningMiners = miners.filter(m => m.status === 'warning' || m.status === 'error');
  
  const totalHashrate = miners.reduce((sum, m) => sum + (m.hashrate || 0), 0);
  const avgTemperature = miners.length > 0 
    ? miners.reduce((sum, m) => sum + (m.temperature || 0), 0) / miners.length 
    : 0;
  const totalPower = miners.reduce((sum, m) => sum + (m.power || 0), 0);
  const totalSharesAccepted = miners.reduce((sum, m) => sum + (m.sharesAccepted || 0), 0);
  const totalSharesRejected = miners.reduce((sum, m) => sum + (m.sharesRejected || 0), 0);
  
  return {
    totalMiners: miners.length,
    onlineMiners: onlineMiners.length,
    offlineMiners: offlineMiners.length,
    warningMiners: warningMiners.length,
    totalHashrate,
    avgTemperature,
    totalPower,
    totalSharesAccepted,
    totalSharesRejected,
    unreadAlerts: unreadCount,
  };
}

// ============ MINER GROUPS FUNCTIONS ============

export type MinerGroup = {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  createdAt: number;
  updatedAt: number;
};

export async function getMinerGroupsByUserId(userId: number): Promise<MinerGroup[]> {
  await getDb();
  return runQuery("SELECT * FROM minerGroups WHERE userId = ? ORDER BY name", [userId]) as MinerGroup[];
}

export async function createMinerGroup(group: {
  userId: number;
  name: string;
  description?: string;
  color?: string;
}): Promise<MinerGroup> {
  await getDb();
  const now = Date.now();
  runExec(
    "INSERT INTO minerGroups (userId, name, description, color, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
    [group.userId, group.name, group.description || null, group.color || '#00ff00', now, now]
  );
  const result = runQuery("SELECT last_insert_rowid() as id");
  const id = result.length > 0 ? result[0].id : 0;
  const groups = runQuery("SELECT * FROM minerGroups WHERE id = ?", [id]);
  return groups[0] as MinerGroup;
}

export async function updateMinerGroup(id: number, updates: Partial<MinerGroup>): Promise<MinerGroup | undefined> {
  await getDb();
  const now = Date.now();
  const group = runQuery("SELECT * FROM minerGroups WHERE id = ?", [id]);
  if (group.length === 0) return undefined;
  
  const existing = group[0] as MinerGroup;
  runExec(
    "UPDATE minerGroups SET name = ?, description = ?, color = ?, updatedAt = ? WHERE id = ?",
    [
      updates.name ?? existing.name,
      updates.description ?? existing.description,
      updates.color ?? existing.color,
      now,
      id
    ]
  );
  
  const updated = runQuery("SELECT * FROM minerGroups WHERE id = ?", [id]);
  return updated[0] as MinerGroup;
}

export async function deleteMinerGroup(id: number): Promise<void> {
  await getDb();
  runExec("DELETE FROM minerGroups WHERE id = ?", [id]);
}

// ============ MINER LOGS FUNCTIONS ============

export type MinerLog = {
  id: number;
  minerId: number;
  logLevel: string;
  source: string | null;
  message: string;
  metadata: string | null;
  createdAt: number;
};

export async function getMinerLogs(minerId: number, limit: number = 100): Promise<MinerLog[]> {
  await getDb();
  return runQuery("SELECT * FROM minerLogs WHERE minerId = ? ORDER BY createdAt DESC LIMIT ?", [minerId, limit]) as MinerLog[];
}

export async function addMinerLog(log: {
  minerId: number;
  logLevel: string;
  source: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
}): Promise<MinerLog> {
  await getDb();
  const now = Date.now();
  runExec(
    "INSERT INTO minerLogs (minerId, logLevel, source, message, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    [log.minerId, log.logLevel, log.source, log.message, log.metadata ? JSON.stringify(log.metadata) : null, now]
  );
  const result = runQuery("SELECT last_insert_rowid() as id");
  const id = result.length > 0 ? result[0].id : 0;
  const logs = runQuery("SELECT * FROM minerLogs WHERE id = ?", [id]);
  return logs[0] as MinerLog;
}

export async function clearMinerLogs(minerId: number): Promise<void> {
  await getDb();
  runExec("DELETE FROM minerLogs WHERE minerId = ?", [minerId]);
}

// ============ APP SETTINGS FUNCTIONS ============

export type AppSettings = {
  id: number;
  username: string;
  passwordHash: string | null;
  appName: string;
  theme: string;
  language: string;
  createdAt: number;
  updatedAt: number;
};

export async function getAppSettings(): Promise<AppSettings | null> {
  await getDb();
  const results = runQuery("SELECT * FROM appSettings LIMIT 1");
  if (results.length === 0) {
    // Create default settings
    const now = Date.now();
    runExec(
      "INSERT INTO appSettings (username, passwordHash, appName, theme, language, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [DEFAULT_USERNAME, null, "BlackAxe", "dark", "en", now, now]
    );
    return {
      id: 1,
      username: DEFAULT_USERNAME,
      passwordHash: null,
      appName: "BlackAxe",
      theme: "dark",
      language: "en",
      createdAt: now,
      updatedAt: now
    };
  }
  return results[0] as AppSettings;
}

export async function verifyAppPassword(password: string): Promise<boolean> {
  const settings = await getAppSettings();
  
  // If no password hash set, check against default password
  if (!settings?.passwordHash) {
    return password === DEFAULT_PASSWORD;
  }
  
  // Verify against stored hash
  try {
    return await bcrypt.compare(password, settings.passwordHash);
  } catch (error) {
    console.error("[Database] Password verification error:", error);
    return false;
  }
}

export async function updateAppPassword(newPassword: string): Promise<void> {
  await getDb();
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const now = Date.now();
  runExec("UPDATE appSettings SET passwordHash = ?, updatedAt = ? WHERE id = 1", [passwordHash, now]);
}

export async function createOrUpdateAppSettings(settings: Partial<AppSettings>): Promise<void> {
  await getDb();
  const existing = await getAppSettings();
  if (!existing) return;
  
  const now = Date.now();
  runExec(
    "UPDATE appSettings SET username = ?, appName = ?, theme = ?, language = ?, updatedAt = ? WHERE id = 1",
    [
      settings.username ?? existing.username,
      settings.appName ?? existing.appName,
      settings.theme ?? existing.theme,
      settings.language ?? existing.language,
      now
    ]
  );
}

export async function updateAppCredentials(username: string, newPassword?: string): Promise<void> {
  await getDb();
  const now = Date.now();
  
  if (newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    runExec("UPDATE appSettings SET username = ?, passwordHash = ?, updatedAt = ? WHERE id = 1", [username, passwordHash, now]);
  } else {
    runExec("UPDATE appSettings SET username = ?, updatedAt = ? WHERE id = 1", [username, now]);
  }
}

// ============ DATABASE INITIALIZATION ============

export async function initializeDatabase() {
  const db = await getDb();
  if (!db) {
    console.error("[Database] Failed to initialize database");
    return;
  }
  
  // Create tables if they don't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openId TEXT NOT NULL UNIQUE,
      name TEXT,
      email TEXT,
      loginMethod TEXT,
      role TEXT DEFAULT 'user' NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      lastSignedIn INTEGER NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS miners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      name TEXT NOT NULL,
      ipAddress TEXT NOT NULL,
      apiPort INTEGER DEFAULT 4028,
      macAddress TEXT,
      minerType TEXT DEFAULT 'other' NOT NULL,
      model TEXT,
      firmware TEXT,
      status TEXT DEFAULT 'unknown' NOT NULL,
      hashrate REAL DEFAULT 0,
      hashrateUnit TEXT DEFAULT 'TH/s',
      temperature REAL,
      maxTemperature REAL,
      fanSpeed INTEGER,
      power REAL,
      voltage REAL,
      frequency INTEGER,
      poolUrl TEXT,
      poolPort INTEGER,
      poolUser TEXT,
      poolPassword TEXT,
      poolUrl2 TEXT,
      poolPort2 INTEGER,
      poolUser2 TEXT,
      poolPassword2 TEXT,
      poolUrl3 TEXT,
      poolPort3 INTEGER,
      poolUser3 TEXT,
      poolPassword3 TEXT,
      poolStatus TEXT,
      poolLastCheckedAt INTEGER,
      poolError TEXT,
      poolVerify TEXT,
      poolVerifyLastCheckedAt INTEGER,
      sharesAccepted INTEGER DEFAULT 0,
      sharesRejected INTEGER DEFAULT 0,
      bestDifficulty TEXT,
      bestDifficultyAllTime TEXT,
      bestDifficultyPrevSession TEXT,
      uptimeSeconds INTEGER DEFAULT 0,
      tags TEXT,
      lastSeen INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  
  // Add new columns if they don't exist (for existing databases)
  try {
    db.run(`ALTER TABLE miners ADD COLUMN bestDifficultyAllTime TEXT`);
  } catch (e) { /* column already exists */ }
  try {
    db.run(`ALTER TABLE miners ADD COLUMN bestDifficultyPrevSession TEXT`);
  } catch (e) { /* column already exists */ }

  // Pool + health fields (added in v12.1)
  const alterMinerColumns = [
    `ALTER TABLE miners ADD COLUMN poolPort INTEGER`,
    `ALTER TABLE miners ADD COLUMN poolUrl2 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolPort2 INTEGER`,
    `ALTER TABLE miners ADD COLUMN poolUser2 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolPassword2 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolUrl3 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolPort3 INTEGER`,
    `ALTER TABLE miners ADD COLUMN poolUser3 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolPassword3 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolStatus TEXT`,
    `ALTER TABLE miners ADD COLUMN poolLastCheckedAt INTEGER`,
    `ALTER TABLE miners ADD COLUMN poolError TEXT`,
    `ALTER TABLE miners ADD COLUMN poolVerify TEXT`,
    `ALTER TABLE miners ADD COLUMN poolVerifyLastCheckedAt INTEGER`,
  ];
  for (const sql of alterMinerColumns) {
    try {
      db.run(sql);
    } catch {
      // column already exists
    }
  }
  
  db.run(`
    CREATE TABLE IF NOT EXISTS minerStats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      minerId INTEGER NOT NULL,
      hashrate REAL,
      temperature REAL,
      fanSpeed INTEGER,
      power REAL,
      voltage REAL,
      frequency INTEGER,
      sharesAccepted INTEGER,
      sharesRejected INTEGER,
      uptime INTEGER,
      efficiency REAL,
      recordedAt INTEGER NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      minerId INTEGER,
      alertType TEXT NOT NULL,
      severity TEXT DEFAULT 'warning' NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      isRead INTEGER DEFAULT 0,
      isAcknowledged INTEGER DEFAULT 0,
      acknowledgedAt INTEGER,
      metadata TEXT,
      createdAt INTEGER NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS appSettings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT DEFAULT 'blackaxe',
      passwordHash TEXT,
      appName TEXT DEFAULT 'BlackAxe',
      theme TEXT DEFAULT 'dark',
      language TEXT DEFAULT 'en',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS userSettings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL UNIQUE,
      tempWarningThreshold INTEGER DEFAULT 70,
      tempCriticalThreshold INTEGER DEFAULT 80,
      hashrateDropThreshold INTEGER DEFAULT 20,
      offlineAlertDelay INTEGER DEFAULT 300,
      fanWarningBelowRpm INTEGER DEFAULT 1000,
      fanCriticalBelowRpm INTEGER DEFAULT 500,
      pushNotifications INTEGER DEFAULT 1,
      emailNotifications INTEGER DEFAULT 0,
      blockFoundNotifications INTEGER DEFAULT 1,
      hashrateUnit TEXT DEFAULT 'TH/s',
      temperatureUnit TEXT DEFAULT 'C',
      refreshInterval INTEGER DEFAULT 3,
      autoScanEnabled INTEGER DEFAULT 0,
      autoScanInterval INTEGER DEFAULT 3600,
      scanSubnet TEXT DEFAULT '192.168.1.0/24',
      poolProfilesJson TEXT DEFAULT '{}',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  // Add new user settings columns for existing databases
  const alterSettingsColumns = [
    `ALTER TABLE userSettings ADD COLUMN fanWarningBelowRpm INTEGER DEFAULT 1000`,
    `ALTER TABLE userSettings ADD COLUMN fanCriticalBelowRpm INTEGER DEFAULT 500`,
    `ALTER TABLE userSettings ADD COLUMN poolProfilesJson TEXT DEFAULT '{}'`,
  ];
  for (const sql of alterSettingsColumns) {
    try {
      db.run(sql);
    } catch {
      // column already exists
    }
  }
  
  db.run(`
    CREATE TABLE IF NOT EXISTS soloBlocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blockHeight INTEGER NOT NULL,
      blockHash TEXT,
      poolName TEXT NOT NULL,
      poolUrl TEXT,
      minerAddress TEXT,
      reward REAL,
      difficulty TEXT,
      localMinerId INTEGER,
      localMinerName TEXT,
      isLocalFind INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL,
      createdAt INTEGER NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS minerGroups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#00ff00',
      icon TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS minerLogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      minerId INTEGER NOT NULL,
      logLevel TEXT NOT NULL,
      source TEXT,
      message TEXT NOT NULL,
      metadata TEXT,
      createdAt INTEGER NOT NULL
    )
  `);
  
  // Save after creating tables
  saveDatabase();
  
  console.log("[Database] SQLite initialized successfully");
}
