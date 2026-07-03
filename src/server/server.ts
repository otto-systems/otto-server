import Fastify from "fastify";
import { registerHealthRoutes } from "../routes/health.js";
import { registerModuleRoutes } from "../routes/modules.js";
import { registerUpdateRoutes } from "../routes/updates.js";
import { ModuleHost } from "../modules/moduleHost.js";
import { UpdateHost } from "../updates/updateHost.js";

export type OttoServer = ReturnType<typeof Fastify>;

export function createServer(): OttoServer {
  const server = Fastify({ logger: false });
  const moduleHost = new ModuleHost();
  const updateHost = new UpdateHost();

  moduleHost.register({ id: "core.shell", name: "Core Shell", version: "0.2.0" });
  updateHost.set({ channel: "stable", currentVersion: "0.2.0", targetVersion: "0.2.0" });

  registerHealthRoutes(server);
  registerModuleRoutes(server);
  registerUpdateRoutes(server);

  server.get("/", async () => ({ status: "ready" }));

  return server;
}
