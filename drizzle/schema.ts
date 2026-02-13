import { integer, text, sqliteTable, real, index } from "drizzle-orm/sqlite-core";

// Core user table backing auth flow
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Miners table - stores all discovered mining devices
export const miners = sqliteTable("miners", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  ipAddress: text("ipAddress").notNull(),
  macAddress: text("macAddress"),
  minerType: text("minerType", { enum: ["bitaxe", "nerdqaxe", "avalon", "antminer", "whatsminer", "canaan", "other"] }).notNull().default("other"),
  model: text("model"),
  firmware: text("firmware"),
  status: text("status", { enum: ["online", "offline", "warning", "error", "unknown"] }).notNull().default("unknown"),
  
  // Current metrics (updated in real-time)
  hashrate: real("hashrate").default(0), // TH/s
  hashrateUnit: text("hashrateUnit").default("TH/s"),
  temperature: real("temperature"), // Celsius
  fanSpeed: integer("fanSpeed"), // RPM or percentage
  power: real("power"), // Watts
  voltage: real("voltage"), // mV
  frequency: integer("frequency"), // MHz
  
  // Pool configuration (Pool 1)
  poolUrl: text("poolUrl"),
  poolPort: integer("poolPort"),
  poolUser: text("poolUser"),
  poolPassword: text("poolPassword"),
  
  // Pool 2 configuration
  poolUrl2: text("poolUrl2"),
  poolPort2: integer("poolPort2"),
  poolUser2: text("poolUser2"),
  poolPassword2: text("poolPassword2"),
  
  // Pool 3 configuration
  poolUrl3: text("poolUrl3"),
  poolPort3: integer("poolPort3"),
  poolUser3: text("poolUser3"),
  poolPassword3: text("poolPassword3"),
  
  // Pool validation (JSON: {"1": "valid", "2": "invalid", "3": "unknown"})
  poolStatus: text("poolStatus"),
  poolError: text("poolError"),
  poolLastCheckedAt: integer("poolLastCheckedAt"),
  
  // Pool deep verification (JSON: {"1": {...}, "2": {...}, "3": {...}})
  poolVerify: text("poolVerify"),
  poolVerifyLastCheckedAt: integer("poolVerifyLastCheckedAt"),
  
  // Share statistics
  sharesAccepted: integer("sharesAccepted").default(0),
  sharesRejected: integer("sharesRejected").default(0),
  bestDifficulty: text("bestDifficulty"),
  bestDifficultyAllTime: text("bestDifficultyAllTime"),
  bestDifficultyPrevSession: text("bestDifficultyPrevSession"),
  
  // Uptime tracking
  uptimeSeconds: integer("uptimeSeconds").default(0),
  
  // Device specifications (for safety limits)
  maxTemperature: integer("maxTemperature").default(75),
  maxFrequency: integer("maxFrequency"),
  minVoltage: integer("minVoltage"),
  maxVoltage: integer("maxVoltage"),
  
  // Organization
  groupId: integer("groupId"),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  notes: text("notes"),
  
  // API configuration
  apiPort: integer("apiPort").default(80),
  apiProtocol: text("apiProtocol").default("http"),
  
  lastSeen: integer("lastSeen", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("miners_userId_idx").on(table.userId),
  index("miners_status_idx").on(table.status),
  index("miners_type_idx").on(table.minerType),
]);

export type Miner = typeof miners.$inferSelect;
export type InsertMiner = typeof miners.$inferInsert;

// Miner statistics history
export const minerStats = sqliteTable("minerStats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  minerId: integer("minerId").notNull(),
  
  hashrate: real("hashrate"),
  temperature: real("temperature"),
  fanSpeed: integer("fanSpeed"),
  power: real("power"),
  voltage: real("voltage"),
  frequency: integer("frequency"),
  
  sharesAccepted: integer("sharesAccepted"),
  sharesRejected: integer("sharesRejected"),
  
  uptime: integer("uptime"), // seconds
  efficiency: real("efficiency"), // J/TH
  
  recordedAt: integer("recordedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("minerStats_minerId_idx").on(table.minerId),
  index("minerStats_recordedAt_idx").on(table.recordedAt),
]);

export type MinerStats = typeof minerStats.$inferSelect;
export type InsertMinerStats = typeof minerStats.$inferInsert;

// Device groups for organization
export const minerGroups = sqliteTable("minerGroups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#00ff00"),
  icon: text("icon"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("minerGroups_userId_idx").on(table.userId),
]);

export type MinerGroup = typeof minerGroups.$inferSelect;
export type InsertMinerGroup = typeof minerGroups.$inferInsert;

// Alerts table
export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  minerId: integer("minerId"),
  
  alertType: text("alertType", { enum: ["high_temperature", "low_hashrate", "device_offline", "power_warning", "fan_failure", "share_rejection", "block_found", "overclock_warning", "voltage_warning", "connection_lost", "custom"] }).notNull(),
  severity: text("severity", { enum: ["info", "warning", "critical"] }).notNull().default("warning"),
  title: text("title").notNull(),
  message: text("message"),
  
  isRead: integer("isRead", { mode: "boolean" }).default(false),
  isAcknowledged: integer("isAcknowledged", { mode: "boolean" }).default(false),
  acknowledgedAt: integer("acknowledgedAt", { mode: "timestamp" }),
  
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("alerts_userId_idx").on(table.userId),
  index("alerts_minerId_idx").on(table.minerId),
  index("alerts_isRead_idx").on(table.isRead),
]);

export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = typeof alerts.$inferInsert;

// Solo blocks found on the network (from public pools)
export const soloBlocks = sqliteTable("soloBlocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  
  blockHeight: integer("blockHeight").notNull(),
  blockHash: text("blockHash"),
  
  poolName: text("poolName").notNull(),
  poolUrl: text("poolUrl"),
  
  minerAddress: text("minerAddress"),
  reward: real("reward"), // BTC
  
  difficulty: text("difficulty"),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  
  // If this block was found by one of our miners
  localMinerId: integer("localMinerId"),
  localMinerName: text("localMinerName"),
  isLocalFind: integer("isLocalFind", { mode: "boolean" }).default(false),
  
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("soloBlocks_blockHeight_idx").on(table.blockHeight),
  index("soloBlocks_poolName_idx").on(table.poolName),
  index("soloBlocks_timestamp_idx").on(table.timestamp),
]);

export type SoloBlock = typeof soloBlocks.$inferSelect;
export type InsertSoloBlock = typeof soloBlocks.$inferInsert;

// Network scan results cache
export const networkScans = sqliteTable("networkScans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  
  subnet: text("subnet").notNull(),
  devicesFound: integer("devicesFound").default(0),
  minersFound: integer("minersFound").default(0),
  
  scanResults: text("scanResults", { mode: "json" }).$type<Array<{
    ip: string;
    mac?: string;
    hostname?: string;
    isMiner: boolean;
    minerType?: string;
    model?: string;
  }>>(),
  
  status: text("status", { enum: ["pending", "scanning", "completed", "failed"] }).default("pending"),
  errorMessage: text("errorMessage"),
  
  startedAt: integer("startedAt", { mode: "timestamp" }),
  completedAt: integer("completedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("networkScans_userId_idx").on(table.userId),
  index("networkScans_status_idx").on(table.status),
]);

export type NetworkScan = typeof networkScans.$inferSelect;
export type InsertNetworkScan = typeof networkScans.$inferInsert;

// User settings for alerts and preferences
export const userSettings = sqliteTable("userSettings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull().unique(),
  
  // Alert thresholds
  tempWarningThreshold: integer("tempWarningThreshold").default(65),
  tempCriticalThreshold: integer("tempCriticalThreshold").default(75),
  hashrateDropThreshold: integer("hashrateDropThreshold").default(20), // percentage
  offlineAlertDelay: integer("offlineAlertDelay").default(300), // seconds
  
  // Notification preferences
  emailNotifications: integer("emailNotifications", { mode: "boolean" }).default(false),
  pushNotifications: integer("pushNotifications", { mode: "boolean" }).default(true),
  blockFoundNotifications: integer("blockFoundNotifications", { mode: "boolean" }).default(true),
  
  // Display preferences
  hashrateUnit: text("hashrateUnit").default("TH/s"),
  temperatureUnit: text("temperatureUnit").default("C"),
  refreshInterval: integer("refreshInterval").default(30), // seconds
  
  // Auto-scan settings
  autoScanEnabled: integer("autoScanEnabled", { mode: "boolean" }).default(false),
  autoScanInterval: integer("autoScanInterval").default(3600), // seconds
  scanSubnet: text("scanSubnet"),
  
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("userSettings_userId_idx").on(table.userId),
]);

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;

// Miner logs table - stores device logs for debugging
export const minerLogs = sqliteTable("minerLogs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  minerId: integer("minerId").notNull(),
  
  logLevel: text("logLevel", { enum: ["debug", "info", "warning", "error", "critical"] }).default("info"),
  source: text("source"), // e.g., "system", "pool", "hardware", "api"
  message: text("message").notNull(),
  
  // Additional context
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("minerLogs_minerId_idx").on(table.minerId),
  index("minerLogs_timestamp_idx").on(table.timestamp),
  index("minerLogs_logLevel_idx").on(table.logLevel),
]);

export type MinerLog = typeof minerLogs.$inferSelect;
export type InsertMinerLog = typeof minerLogs.$inferInsert;

// App settings - local authentication and preferences
export const appSettings = sqliteTable("appSettings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  
  // Local authentication (simple username/password)
  username: text("username").default("blackaxe"),
  passwordHash: text("passwordHash"), // bcrypt hash
  
  // App preferences
  appName: text("appName").default("BlackAxe"),
  theme: text("theme", { enum: ["dark", "light"] }).default("dark"),
  language: text("language").default("en"),
  
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = typeof appSettings.$inferInsert;
