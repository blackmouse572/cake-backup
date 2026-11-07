CREATE TABLE `provider_tokens` (
	`provider` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
