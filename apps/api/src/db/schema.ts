import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const deploymentStatusValues = [
  "pending",
  "cloning",
  "building",
  "deploying",
  "running",
  "failed",
] as const;

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repoUrl: text("repo_url").notNull(),
  status: text("status", { enum: deploymentStatusValues }).notNull(),
  imageTag: text("image_tag"),
  containerId: text("container_id"),
  url: text("url"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const deploymentLogs = sqliteTable("deployment_logs", {
  id: text("id").primaryKey(),
  deploymentId: text("deployment_id").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
  stream: text("stream").notNull(),
  message: text("message").notNull(),
});
