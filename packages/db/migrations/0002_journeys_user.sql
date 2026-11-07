-- Journeys started before sign-in was required belong to no one ("anonymous"); drop them.
DELETE FROM `alert_events` WHERE `journey_id` IN (SELECT `id` FROM `journeys` WHERE `user_id` NOT IN (SELECT `id` FROM `user`));--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`destination_name` text NOT NULL,
	`expected_arrival_at` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`saved` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_journeys`("id", "user_id", "status", "destination_name", "expected_arrival_at", "started_at", "ended_at", "saved") SELECT "id", "user_id", "status", "destination_name", "expected_arrival_at", "started_at", "ended_at", "saved" FROM `journeys` WHERE `user_id` IN (SELECT `id` FROM `user`);--> statement-breakpoint
DROP TABLE `journeys`;--> statement-breakpoint
ALTER TABLE `__new_journeys` RENAME TO `journeys`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `journeys_user_idx` ON `journeys` (`user_id`);