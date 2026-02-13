CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`minerId` integer,
	`alertType` text NOT NULL,
	`severity` text DEFAULT 'warning' NOT NULL,
	`title` text NOT NULL,
	`message` text,
	`isRead` integer DEFAULT false,
	`isAcknowledged` integer DEFAULT false,
	`acknowledgedAt` integer,
	`metadata` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `alerts_userId_idx` ON `alerts` (`userId`);--> statement-breakpoint
CREATE INDEX `alerts_minerId_idx` ON `alerts` (`minerId`);--> statement-breakpoint
CREATE INDEX `alerts_isRead_idx` ON `alerts` (`isRead`);--> statement-breakpoint
CREATE TABLE `appSettings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text DEFAULT 'blackaxe',
	`passwordHash` text,
	`appName` text DEFAULT 'BlackAxe',
	`theme` text DEFAULT 'dark',
	`language` text DEFAULT 'en',
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `minerGroups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`color` text DEFAULT '#00ff00',
	`icon` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `minerGroups_userId_idx` ON `minerGroups` (`userId`);--> statement-breakpoint
CREATE TABLE `minerLogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`minerId` integer NOT NULL,
	`logLevel` text DEFAULT 'info',
	`source` text,
	`message` text NOT NULL,
	`metadata` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `minerLogs_minerId_idx` ON `minerLogs` (`minerId`);--> statement-breakpoint
CREATE INDEX `minerLogs_timestamp_idx` ON `minerLogs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `minerLogs_logLevel_idx` ON `minerLogs` (`logLevel`);--> statement-breakpoint
CREATE TABLE `minerStats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`minerId` integer NOT NULL,
	`hashrate` real,
	`temperature` real,
	`fanSpeed` integer,
	`power` real,
	`voltage` real,
	`frequency` integer,
	`sharesAccepted` integer,
	`sharesRejected` integer,
	`uptime` integer,
	`efficiency` real,
	`recordedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `minerStats_minerId_idx` ON `minerStats` (`minerId`);--> statement-breakpoint
CREATE INDEX `minerStats_recordedAt_idx` ON `minerStats` (`recordedAt`);--> statement-breakpoint
CREATE TABLE `miners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`name` text NOT NULL,
	`ipAddress` text NOT NULL,
	`macAddress` text,
	`minerType` text DEFAULT 'other' NOT NULL,
	`model` text,
	`firmware` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`hashrate` real DEFAULT 0,
	`hashrateUnit` text DEFAULT 'TH/s',
	`temperature` real,
	`fanSpeed` integer,
	`power` real,
	`voltage` real,
	`frequency` integer,
	`poolUrl` text,
	`poolUser` text,
	`poolPassword` text,
	`sharesAccepted` integer DEFAULT 0,
	`sharesRejected` integer DEFAULT 0,
	`bestDifficulty` text,
	`maxTemperature` integer DEFAULT 75,
	`maxFrequency` integer,
	`minVoltage` integer,
	`maxVoltage` integer,
	`groupId` integer,
	`tags` text,
	`notes` text,
	`apiPort` integer DEFAULT 80,
	`apiProtocol` text DEFAULT 'http',
	`lastSeen` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `miners_userId_idx` ON `miners` (`userId`);--> statement-breakpoint
CREATE INDEX `miners_status_idx` ON `miners` (`status`);--> statement-breakpoint
CREATE INDEX `miners_type_idx` ON `miners` (`minerType`);--> statement-breakpoint
CREATE TABLE `networkScans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`subnet` text NOT NULL,
	`devicesFound` integer DEFAULT 0,
	`minersFound` integer DEFAULT 0,
	`scanResults` text,
	`status` text DEFAULT 'pending',
	`errorMessage` text,
	`startedAt` integer,
	`completedAt` integer,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `networkScans_userId_idx` ON `networkScans` (`userId`);--> statement-breakpoint
CREATE INDEX `networkScans_status_idx` ON `networkScans` (`status`);--> statement-breakpoint
CREATE TABLE `soloBlocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`blockHeight` integer NOT NULL,
	`blockHash` text,
	`poolName` text NOT NULL,
	`poolUrl` text,
	`minerAddress` text,
	`reward` real,
	`difficulty` text,
	`timestamp` integer NOT NULL,
	`localMinerId` integer,
	`isLocalFind` integer DEFAULT false,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `soloBlocks_blockHeight_idx` ON `soloBlocks` (`blockHeight`);--> statement-breakpoint
CREATE INDEX `soloBlocks_poolName_idx` ON `soloBlocks` (`poolName`);--> statement-breakpoint
CREATE INDEX `soloBlocks_timestamp_idx` ON `soloBlocks` (`timestamp`);--> statement-breakpoint
CREATE TABLE `userSettings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`tempWarningThreshold` integer DEFAULT 65,
	`tempCriticalThreshold` integer DEFAULT 75,
	`hashrateDropThreshold` integer DEFAULT 20,
	`offlineAlertDelay` integer DEFAULT 300,
	`emailNotifications` integer DEFAULT false,
	`pushNotifications` integer DEFAULT true,
	`blockFoundNotifications` integer DEFAULT true,
	`hashrateUnit` text DEFAULT 'TH/s',
	`temperatureUnit` text DEFAULT 'C',
	`refreshInterval` integer DEFAULT 30,
	`autoScanEnabled` integer DEFAULT false,
	`autoScanInterval` integer DEFAULT 3600,
	`scanSubnet` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `userSettings_userId_unique` ON `userSettings` (`userId`);--> statement-breakpoint
CREATE INDEX `userSettings_userId_idx` ON `userSettings` (`userId`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastSignedIn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);