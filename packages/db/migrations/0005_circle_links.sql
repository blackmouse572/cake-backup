CREATE TABLE `circle_links` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `circle_links_journey_idx` ON `circle_links` (`journey_id`);