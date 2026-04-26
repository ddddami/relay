import * as assert from "node:assert";
import { test } from "node:test";

import { deployments } from "../../src/db/schema";
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
