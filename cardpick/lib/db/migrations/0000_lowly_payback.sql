CREATE TABLE `condition_suffix` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`suffix` text NOT NULL,
	`printing_code` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `condition_suffix_unique` ON `condition_suffix` (`suffix`);--> statement-breakpoint
CREATE TABLE `history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`action` text NOT NULL,
	`reason` text,
	`before_json` text,
	`after_json` text,
	`group_id` text,
	`reversed` integer DEFAULT false NOT NULL,
	`reversal_of_id` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `history_entity_idx` ON `history` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `history_group_idx` ON `history` (`group_id`);--> statement-breakpoint
CREATE TABLE `import_batch` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`sha256` text NOT NULL,
	`kind` text NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`mapping_profile_id` integer,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`imported_at` text DEFAULT (current_timestamp) NOT NULL,
	`committed_at` text,
	`notes` text,
	FOREIGN KEY (`mapping_profile_id`) REFERENCES `mapping_profile`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `import_batch_sha256_idx` ON `import_batch` (`sha256`);--> statement-breakpoint
CREATE TABLE `import_row` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_batch_id` integer NOT NULL,
	`row_index` integer NOT NULL,
	`raw_json` text NOT NULL,
	`mapped_json` text NOT NULL,
	`match_status` text NOT NULL,
	`matched_inventory_item_id` integer,
	`candidates_json` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batch`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matched_inventory_item_id`) REFERENCES `inventory_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `import_row_batch_idx` ON `import_row` (`import_batch_id`);--> statement-breakpoint
CREATE TABLE `inventory_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tcgplayer_product_id` text,
	`tcgplayer_sku_id` text,
	`name` text NOT NULL,
	`set_name` text NOT NULL,
	`set_code` text,
	`card_number` text DEFAULT '' NOT NULL,
	`printing` text DEFAULT 'NORMAL' NOT NULL,
	`condition` text NOT NULL,
	`match_key` text NOT NULL,
	`market_price_cents` integer,
	`market_price_asof` text,
	`sell_price_cents` integer,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`source` text,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_item_match_key_unique` ON `inventory_item` (`match_key`);--> statement-breakpoint
CREATE INDEX `inventory_item_sku_idx` ON `inventory_item` (`tcgplayer_sku_id`);--> statement-breakpoint
CREATE INDEX `inventory_item_product_idx` ON `inventory_item` (`tcgplayer_product_id`);--> statement-breakpoint
CREATE INDEX `inventory_item_name_idx` ON `inventory_item` (`name`);--> statement-breakpoint
CREATE INDEX `inventory_item_set_name_idx` ON `inventory_item` (`set_name`);--> statement-breakpoint
CREATE INDEX `inventory_item_card_number_idx` ON `inventory_item` (`card_number`);--> statement-breakpoint
CREATE TABLE `inventory_lot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inventory_item_id` integer NOT NULL,
	`location_id` integer NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_lot_item_idx` ON `inventory_lot` (`inventory_item_id`);--> statement-breakpoint
CREATE INDEX `inventory_lot_location_idx` ON `inventory_lot` (`location_id`);--> statement-breakpoint
CREATE TABLE `location` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`max_skus` integer,
	`max_quantity` integer,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `location_code_unique` ON `location` (`code`);--> statement-breakpoint
CREATE TABLE `mapping_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`shape_signature` text NOT NULL,
	`field_map_json` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_profile_shape_unique` ON `mapping_profile` (`kind`,`shape_signature`);--> statement-breakpoint
CREATE TABLE `order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_order_id` text NOT NULL,
	`source` text,
	`import_batch_id` integer,
	`imported_at` text DEFAULT (current_timestamp) NOT NULL,
	`ship_by` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batch`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_external_id_unique` ON `order` (`external_order_id`);--> statement-breakpoint
CREATE TABLE `order_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`line_index` integer NOT NULL,
	`raw_name` text NOT NULL,
	`raw_set_name` text,
	`raw_card_number` text,
	`raw_condition` text,
	`raw_printing` text,
	`quantity_ordered` integer DEFAULT 1 NOT NULL,
	`quantity_picked` integer DEFAULT 0 NOT NULL,
	`matched_inventory_item_id` integer,
	`match_status` text NOT NULL,
	`candidates_json` text,
	`pick_state` text DEFAULT 'PENDING' NOT NULL,
	`short_reason` text,
	`resolution_action` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matched_inventory_item_id`) REFERENCES `inventory_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_line_natural_key` ON `order_line` (`order_id`,`line_index`);--> statement-breakpoint
CREATE INDEX `order_line_order_idx` ON `order_line` (`order_id`);--> statement-breakpoint
CREATE TABLE `set_alias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alias` text NOT NULL,
	`full_name` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `set_alias_alias_unique` ON `set_alias` (`alias`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
