CREATE TABLE `push_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_tokens_user_idx` ON `push_tokens` (`user_id`);--> statement-breakpoint
ALTER TABLE `traveller_settings` ADD `caller_name` text;--> statement-breakpoint
ALTER TABLE `traveller_settings` ADD `call_vibrate_only` integer DEFAULT false NOT NULL;