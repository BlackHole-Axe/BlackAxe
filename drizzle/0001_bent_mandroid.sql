CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`minerId` int,
	`alertType` enum('high_temperature','low_hashrate','device_offline','power_warning','fan_failure','share_rejection','block_found','overclock_warning','voltage_warning','connection_lost','custom') NOT NULL,
	`alertSeverity` enum('info','warning','critical') NOT NULL DEFAULT 'warning',
	`title` varchar(256) NOT NULL,
	`message` text,
	`isRead` boolean DEFAULT false,
	`isAcknowledged` boolean DEFAULT false,
	`acknowledgedAt` timestamp,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `minerGroups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`color` varchar(7) DEFAULT '#00ff00',
	`icon` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `minerGroups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `minerStats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`minerId` int NOT NULL,
	`hashrate` float,
	`temperature` float,
	`fanSpeed` int,
	`power` float,
	`voltage` float,
	`frequency` int,
	`sharesAccepted` bigint,
	`sharesRejected` bigint,
	`uptime` int,
	`efficiency` float,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `minerStats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `miners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`ipAddress` varchar(45) NOT NULL,
	`macAddress` varchar(17),
	`minerType` enum('bitaxe','nerdqaxe','avalon','antminer','whatsminer','canaan','other') NOT NULL DEFAULT 'other',
	`model` varchar(128),
	`firmware` varchar(64),
	`deviceStatus` enum('online','offline','warning','error','unknown') NOT NULL DEFAULT 'unknown',
	`hashrate` float DEFAULT 0,
	`hashrateUnit` varchar(10) DEFAULT 'TH/s',
	`temperature` float,
	`fanSpeed` int,
	`power` float,
	`voltage` float,
	`frequency` int,
	`poolUrl` varchar(512),
	`poolUser` varchar(256),
	`poolPassword` varchar(128),
	`sharesAccepted` bigint DEFAULT 0,
	`sharesRejected` bigint DEFAULT 0,
	`bestDifficulty` varchar(64),
	`maxTemperature` int DEFAULT 75,
	`maxFrequency` int,
	`minVoltage` int,
	`maxVoltage` int,
	`groupId` int,
	`tags` json,
	`notes` text,
	`apiPort` int DEFAULT 80,
	`apiProtocol` varchar(10) DEFAULT 'http',
	`lastSeen` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `miners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `networkScans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`subnet` varchar(45) NOT NULL,
	`devicesFound` int DEFAULT 0,
	`minersFound` int DEFAULT 0,
	`scanResults` json,
	`status` enum('pending','scanning','completed','failed') DEFAULT 'pending',
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `networkScans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `soloBlocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockHeight` bigint NOT NULL,
	`blockHash` varchar(64),
	`poolName` varchar(128) NOT NULL,
	`poolUrl` varchar(512),
	`minerAddress` varchar(128),
	`reward` float,
	`difficulty` varchar(64),
	`timestamp` timestamp NOT NULL,
	`localMinerId` int,
	`isLocalFind` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `soloBlocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tempWarningThreshold` int DEFAULT 65,
	`tempCriticalThreshold` int DEFAULT 75,
	`hashrateDropThreshold` int DEFAULT 20,
	`offlineAlertDelay` int DEFAULT 300,
	`emailNotifications` boolean DEFAULT false,
	`pushNotifications` boolean DEFAULT true,
	`blockFoundNotifications` boolean DEFAULT true,
	`hashrateUnit` varchar(10) DEFAULT 'TH/s',
	`temperatureUnit` varchar(1) DEFAULT 'C',
	`refreshInterval` int DEFAULT 30,
	`autoScanEnabled` boolean DEFAULT false,
	`autoScanInterval` int DEFAULT 3600,
	`scanSubnet` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `userSettings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `alerts_userId_idx` ON `alerts` (`userId`);--> statement-breakpoint
CREATE INDEX `alerts_minerId_idx` ON `alerts` (`minerId`);--> statement-breakpoint
CREATE INDEX `alerts_isRead_idx` ON `alerts` (`isRead`);--> statement-breakpoint
CREATE INDEX `minerGroups_userId_idx` ON `minerGroups` (`userId`);--> statement-breakpoint
CREATE INDEX `minerStats_minerId_idx` ON `minerStats` (`minerId`);--> statement-breakpoint
CREATE INDEX `minerStats_recordedAt_idx` ON `minerStats` (`recordedAt`);--> statement-breakpoint
CREATE INDEX `miners_userId_idx` ON `miners` (`userId`);--> statement-breakpoint
CREATE INDEX `miners_status_idx` ON `miners` (`deviceStatus`);--> statement-breakpoint
CREATE INDEX `miners_type_idx` ON `miners` (`minerType`);--> statement-breakpoint
CREATE INDEX `networkScans_userId_idx` ON `networkScans` (`userId`);--> statement-breakpoint
CREATE INDEX `networkScans_status_idx` ON `networkScans` (`status`);--> statement-breakpoint
CREATE INDEX `soloBlocks_blockHeight_idx` ON `soloBlocks` (`blockHeight`);--> statement-breakpoint
CREATE INDEX `soloBlocks_poolName_idx` ON `soloBlocks` (`poolName`);--> statement-breakpoint
CREATE INDEX `soloBlocks_timestamp_idx` ON `soloBlocks` (`timestamp`);--> statement-breakpoint
CREATE INDEX `userSettings_userId_idx` ON `userSettings` (`userId`);