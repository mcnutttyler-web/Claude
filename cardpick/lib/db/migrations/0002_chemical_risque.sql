CREATE TABLE `card_scan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`image_path` text NOT NULL,
	`captured_at` text DEFAULT (current_timestamp) NOT NULL,
	`recognized_name` text,
	`recognized_set_name_guess` text,
	`recognized_card_number_guess` text,
	`recognized_printing_guess` text,
	`confidence` text,
	`vision_raw_json` text,
	`reference_card_id` integer,
	`resolution_status` text DEFAULT 'PENDING' NOT NULL,
	`resulting_inventory_item_id` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`reference_card_id`) REFERENCES `reference_card`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resulting_inventory_item_id`) REFERENCES `inventory_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_scan_status_idx` ON `card_scan` (`resolution_status`);--> statement-breakpoint
CREATE TABLE `reference_card` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text DEFAULT 'POKEMONTCG' NOT NULL,
	`source_id` text NOT NULL,
	`name` text NOT NULL,
	`set_name` text NOT NULL,
	`set_code` text,
	`card_number` text DEFAULT '' NOT NULL,
	`printing_code` text DEFAULT 'NORMAL' NOT NULL,
	`small_image_url` text,
	`large_image_url` text,
	`tcgplayer_product_id` text,
	`raw_json` text NOT NULL,
	`fetched_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reference_card_source_id_unique` ON `reference_card` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `reference_card_name_idx` ON `reference_card` (`name`);--> statement-breakpoint
CREATE INDEX `reference_card_set_name_idx` ON `reference_card` (`set_name`);