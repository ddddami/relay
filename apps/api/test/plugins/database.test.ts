import * as assert from "node:assert";
import { test } from "node:test";

import Fastify from "fastify";

import Database from "../../src/plugins/database";

test("database plugin decorates the fastify instance", async () => {
  const fastify = Fastify();

  void fastify.register(Database);
  await fastify.ready();

  assert.ok(fastify.db);
});
