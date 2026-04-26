// This file contains code that we reuse between our tests.
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as test from "node:test";
const helper = require("fastify-cli/helper.js");

const databaseFilePath = path.join(os.tmpdir(), `relay-test-${randomUUID()}.db`);

process.env.DATABASE_URL = `file:${databaseFilePath}`;
process.env.DISABLE_DEPLOYMENT_RUNNER = "1";

test.after(async () => {
  await rm(databaseFilePath, { force: true });
});

export type TestContext = {
  after: typeof test.after;
};

const AppPath = path.join(__dirname, "..", "src", "app.ts");

// Fill in this config with all the configurations
// needed for testing the application
function config() {
  return {
    skipOverride: true, // Register our application with fastify-plugin
  };
}

// Automatically build and tear down our instance
async function build(t: TestContext) {
  // you can set all the options supported by the fastify CLI command
  const argv = [AppPath];

  // fastify-plugin ensures that all decorators
  // are exposed for testing purposes, this is
  // different from the production setup
  const app = await helper.build(argv, config());

  // Tear down our app after we are done
  t.after(async () => await app.close());

  return app;
}

export { config, build };
