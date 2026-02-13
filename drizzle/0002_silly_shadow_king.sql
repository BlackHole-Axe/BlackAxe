CREATE TABLE `appSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) DEFAULT 'blackaxe',
	`passwordHash` varchar(256),
	`appName` varchar(128) DEFAULT 'BlackAxe',
	`theme` enum('dark','light') DEFAULT 'dark',
	`language` varchar(10) DEFAULT 'en',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `minerLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`minerId` int NOT NULL,
	`logLevel` enum('debug','info','warning','error','critical') DEFAULT 'info',
	`source` varchar(64),
	`message` text NOT NULL,
	`metadata` json,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `minerLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `minerLogs_minerId_idx` ON `minerLogs` (`minerId`);--> statement-breakpoint
CREATE INDEX `minerLogs_timestamp_idx` ON `minerLogs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `minerLogs_logLevel_idx` ON `minerLogs` (`logLevel`);