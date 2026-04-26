CREATE TABLE `deployment_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`deployment_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`stream` text NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repo_url` text NOT NULL,
	`status` text NOT NULL,
	`image_tag` text,
	`container_id` text,
	`url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
