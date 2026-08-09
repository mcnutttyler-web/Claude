CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`export_include_quantity` integer DEFAULT false NOT NULL,
	`export_quantity_mode` text DEFAULT 'TOTAL' NOT NULL,
	`late_order_threshold_hours` integer DEFAULT 24 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_batch` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`sha256` text NOT NULL,
	`kind` text NOT NULL,
	`row_count` integer NOT NULL,
	`mapping_profile_id` integer,
	`warnings` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`mapping_profile_id`) REFERENCES `mapping_profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventory_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inventory_item_id` integer,
	`order_id` integer,
	`action` text NOT NULL,
	`field` text,
	`old_value` text,
	`new_value` text,
	`batch_group_id` text,
	`reversible` integer DEFAULT false NOT NULL,
	`reversed_at` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_history_item_idx` ON `inventory_history` (`inventory_item_id`);--> statement-breakpoint
CREATE INDEX `inventory_history_batch_idx` ON `inventory_history` (`batch_group_id`);--> statement-breakpoint
CREATE TABLE `inventory_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tcgplayer_product_id` text,
	`tcgplayer_sku_id` text,
	`name` text NOT NULL,
	`set_name` text NOT NULL,
	`set_code` text,
	`card_number` text,
	`printing` text DEFAULT 'Normal' NOT NULL,
	`condition` text NOT NULL,
	`match_key` text NOT NULL,
	`market_price_cents` integer,
	`market_price_asof` text,
	`sell_price_cents` integer,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`source` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_item_match_key_idx` ON `inventory_item` (`match_key`);--> statement-breakpoint
CREATE INDEX `inventory_item_name_idx` ON `inventory_item` (`name`);--> statement-breakpoint
CREATE INDEX `inventory_item_set_name_idx` ON `inventory_item` (`set_name`);--> statement-breakpoint
CREATE INDEX `inventory_item_card_number_idx` ON `inventory_item` (`card_number`);--> statement-breakpoint
CREATE INDEX `inventory_item_sku_idx` ON `inventory_item` (`tcgplayer_sku_id`);--> statement-breakpoint
CREATE INDEX `inventory_item_product_idx` ON `inventory_item` (`tcgplayer_product_id`);--> statement-breakpoint
CREATE TABLE `inventory_lot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inventory_item_id` integer NOT NULL,
	`location_id` integer NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_lot_item_idx` ON `inventory_lot` (`inventory_item_id`);--> statement-breakpoint
CREATE TABLE `location` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`max_skus` integer,
	`max_quantity` integer,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `location_code_idx` ON `location` (`code`);--> statement-breakpoint
CREATE TABLE `mapping_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`shape_signature` text NOT NULL,
	`column_map` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tcgplayer_order_id` text NOT NULL,
	`imported_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`ship_by` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`import_batch_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batch`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_tcgplayer_id_idx` ON `order` (`tcgplayer_order_id`);--> statement-breakpoint
CREATE TABLE `order_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`line_index` integer NOT NULL,
	`name` text NOT NULL,
	`set_name` text,
	`card_number` text,
	`condition` text,
	`printing` text,
	`tcgplayer_sku_id` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`matched_inventory_item_id` integer,
	`match_status` text DEFAULT 'UNMATCHED' NOT NULL,
	`pick_state` text DEFAULT 'PENDING' NOT NULL,
	`short_reason` text,
	`resolution` text,
	`picked_location_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matched_inventory_item_id`) REFERENCES `inventory_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`picked_location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_line_natural_key_idx` ON `order_line` (`order_id`,`line_index`);--> statement-breakpoint
CREATE TABLE `pricing_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`low_floor_cents` integer DEFAULT 49 NOT NULL,
	`p1_bps` integer DEFAULT 0 NOT NULL,
	`p2_bps` integer DEFAULT 0 NOT NULL,
	`p3_bps` integer DEFAULT 0 NOT NULL,
	`rounding_mode` text DEFAULT 'UP_TO_X9' NOT NULL,
	`hard_floor_cents` integer DEFAULT 49 NOT NULL,
	`staleness_days` integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `set_alias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alias` text NOT NULL,
	`full_name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `set_alias_alias_idx` ON `set_alias` (`alias`);