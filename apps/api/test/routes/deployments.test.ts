import * as assert from "node:assert";
import { test } from "node:test";

import { deploymentLogs, deployments } from "../../src/db/schema";
import { build } from "../helper";

test("deployments route returns an empty list by default", async (t) => {
  const app = await build(t);

  await app.db.delete(deployments);

  const res = await app.inject({
    url: "/deployments",
  });

  assert.deepStrictEqual(JSON.parse(res.payload), []);
});

test("deployments route returns persisted deployments", async (t) => {
  const app = await build(t);

  await app.db.delete(deployments);

  await app.db.insert(deployments).values({
    id: "dep_1",
    name: "storm-fox-123",
    repoUrl: "https://github.com/acme/example-app",
    status: "pending",
    imageTag: null,
    containerId: null,
    url: null,
    createdAt: new Date("2026-04-26T19:00:00.000Z"),
    updatedAt: new Date("2026-04-26T19:00:00.000Z"),
  });

  const res = await app.inject({
    url: "/deployments",
  });

  assert.deepStrictEqual(JSON.parse(res.payload), [
    {
      id: "dep_1",
      name: "storm-fox-123",
      repoUrl: "https://github.com/acme/example-app",
      status: "pending",
      imageTag: null,
      containerId: null,
      url: null,
      createdAt: "2026-04-26T19:00:00.000Z",
      updatedAt: "2026-04-26T19:00:00.000Z",
    },
  ]);
});

test("deployments route creates a pending deployment", async (t) => {
  const app = await build(t);

  await app.db.delete(deployments);

  const res = await app.inject({
    method: "POST",
    url: "/deployments",
    payload: {
      repoUrl: "https://github.com/acme/example-app",
    },
  });

  assert.equal(res.statusCode, 201);

  const payload = JSON.parse(res.payload);

  assert.equal(payload.repoUrl, "https://github.com/acme/example-app");
  assert.equal(payload.status, "pending");
  assert.equal(payload.imageTag, null);
  assert.equal(payload.containerId, null);
  assert.equal(payload.url, null);
  assert.match(payload.id, /^[0-9a-f-]{36}$/);
  assert.match(payload.name, /^example-app-\d{3}$/);
  assert.ok(Date.parse(payload.createdAt));
  assert.equal(payload.createdAt, payload.updatedAt);

  const rows = await app.db.select().from(deployments);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].repoUrl, "https://github.com/acme/example-app");
  assert.equal(rows[0].status, "pending");
});

test("deployments route rejects invalid repository URLs", async (t) => {
  const app = await build(t);

  const res = await app.inject({
    method: "POST",
    url: "/deployments",
    payload: {
      repoUrl: "https://gitlab.com/acme/example-app",
    },
  });

  assert.equal(res.statusCode, 400);
  assert.deepStrictEqual(JSON.parse(res.payload), {
    message: "A valid public GitHub repository URL is required.",
  });
});

test("deployment detail route returns a persisted deployment", async (t) => {
  const app = await build(t);

  await app.db.delete(deployments);

  await app.db.insert(deployments).values({
    id: "dep_detail",
    name: "storm-fox-123",
    repoUrl: "https://github.com/acme/example-app",
    status: "pending",
    imageTag: null,
    containerId: null,
    url: null,
    createdAt: new Date("2026-04-26T19:00:00.000Z"),
    updatedAt: new Date("2026-04-26T19:00:00.000Z"),
  });

  const res = await app.inject({
    url: "/deployments/dep_detail",
  });

  assert.equal(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.payload), {
    id: "dep_detail",
    name: "storm-fox-123",
    repoUrl: "https://github.com/acme/example-app",
    status: "pending",
    imageTag: null,
    containerId: null,
    url: null,
    createdAt: "2026-04-26T19:00:00.000Z",
    updatedAt: "2026-04-26T19:00:00.000Z",
  });
});

test("deployment detail route returns not found for unknown ids", async (t) => {
  const app = await build(t);

  const res = await app.inject({
    url: "/deployments/unknown",
  });

  assert.equal(res.statusCode, 404);
  assert.deepStrictEqual(JSON.parse(res.payload), {
    message: "Deployment not found.",
  });
});

test("deployment logs route returns an empty list by default", async (t) => {
  const app = await build(t);

  await app.db.delete(deploymentLogs);
  await app.db.delete(deployments);

  await app.db.insert(deployments).values({
    id: "dep_logs_empty",
    name: "storm-fox-123",
    repoUrl: "https://github.com/acme/example-app",
    status: "pending",
    imageTag: null,
    containerId: null,
    url: null,
    createdAt: new Date("2026-04-26T19:00:00.000Z"),
    updatedAt: new Date("2026-04-26T19:00:00.000Z"),
  });

  const res = await app.inject({
    url: "/deployments/dep_logs_empty/logs",
  });

  assert.equal(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.payload), []);
});

test("deployment logs route returns persisted logs in timestamp order", async (t) => {
  const app = await build(t);

  await app.db.delete(deploymentLogs);
  await app.db.delete(deployments);

  await app.db.insert(deployments).values({
    id: "dep_logs",
    name: "storm-fox-123",
    repoUrl: "https://github.com/acme/example-app",
    status: "building",
    imageTag: null,
    containerId: null,
    url: null,
    createdAt: new Date("2026-04-26T19:00:00.000Z"),
    updatedAt: new Date("2026-04-26T19:00:00.000Z"),
  });

  await app.db.insert(deploymentLogs).values([
    {
      id: "log_2",
      deploymentId: "dep_logs",
      timestamp: new Date("2026-04-26T19:00:02.000Z"),
      stream: "stdout",
      message: "building image",
    },
    {
      id: "log_1",
      deploymentId: "dep_logs",
      timestamp: new Date("2026-04-26T19:00:01.000Z"),
      stream: "stdout",
      message: "cloning repo",
    },
  ]);

  const res = await app.inject({
    url: "/deployments/dep_logs/logs",
  });

  assert.equal(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.payload), [
    {
      id: "log_1",
      deploymentId: "dep_logs",
      timestamp: "2026-04-26T19:00:01.000Z",
      stream: "stdout",
      message: "cloning repo",
    },
    {
      id: "log_2",
      deploymentId: "dep_logs",
      timestamp: "2026-04-26T19:00:02.000Z",
      stream: "stdout",
      message: "building image",
    },
  ]);
});

test("deployment logs route returns not found for unknown ids", async (t) => {
  const app = await build(t);

  const res = await app.inject({
    url: "/deployments/unknown/logs",
  });

  assert.equal(res.statusCode, 404);
  assert.deepStrictEqual(JSON.parse(res.payload), {
    message: "Deployment not found.",
  });
});
