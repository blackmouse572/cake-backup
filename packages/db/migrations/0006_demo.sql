CREATE TABLE `demo_lockouts` (
	`client_hash` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`locked_until` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `demo_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`to` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `demo_messages_journey_idx` ON `demo_messages` (`journey_id`);