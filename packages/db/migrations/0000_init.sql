CREATE TABLE `alert_events` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`reason` text NOT NULL,
	`step` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `alert_events_journey_idx` ON `alert_events` (`journey_id`);--> statement-breakpoint
CREATE TABLE `circle_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `circle_contacts_user_idx` ON `circle_contacts` (`user_id`);--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`destination_name` text NOT NULL,
	`expected_arrival_at` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`saved` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `journeys_user_idx` ON `journeys` (`user_id`);--> statement-breakpoint
CREATE TABLE `traveller_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`locale` text DEFAULT 'vi' NOT NULL,
	`police_enabled` integer DEFAULT false NOT NULL,
	`safe_code_hash` text,
	`duress_code_hash` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
