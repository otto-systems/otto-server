import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import Fastify from "fastify";
import { registerHealthRoutes } from "../routes/health.js";
import { registerModuleRoutes } from "../routes/modules.js";
import { registerUpdateRoutes } from "../routes/updates.js";
import { ModuleHost } from "../modules/moduleHost.js";
import { UpdateHost } from "../updates/updateHost.js";
import {
  CERTIFICATE_COMMAND_DESCRIPTORS,
  createCertificateLifecycleService,
  registerCertificateCommands,
  type CertificateLifecycleConfig,
  type CertificateCommandDescriptor
} from "../certificates/index.js";

export type OttoServer = ReturnType<typeof Fastify>;

export type RequestListener = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

export interface NodeServerOptions {
  host?: string;
  port?: number;
  requestListener?: RequestListener;
  https?: {
    key?: string | Buffer;
    cert?: string | Buffer;
    keyPath?: string;
    certPath?: string;
    caPath?: string;
  };
}

async function readOptionalBuffer(value: string | Buffer | undefined, filePath: string | undefined): Promise<string | Buffer | undefined> {
  if (value !== undefined) {
    return value;
  }

  if (!filePath) {
    return undefined;
  }

  return fs.readFile(filePath);
}

export async function createNodeServer(options: NodeServerOptions = {}): Promise<Server> {
  const requestListener = options.requestListener ?? (() => undefined);
  const httpsOptions = options.https;

  if (!httpsOptions || (!httpsOptions.key && !httpsOptions.cert && !httpsOptions.keyPath && !httpsOptions.certPath)) {
    return http.createServer(requestListener);
  }

  const key = await readOptionalBuffer(httpsOptions.key, httpsOptions.keyPath);
  const cert = await readOptionalBuffer(httpsOptions.cert, httpsOptions.certPath);
  const ca = httpsOptions.caPath ? await fs.readFile(httpsOptions.caPath) : undefined;

  return https.createServer({ key, cert, ca }, requestListener);
}

export interface OttoServerOptions {
  logger?: boolean;
  host?: string;
  port?: number;
  certificates?: CertificateLifecycleConfig;
}

const registeredCertificateCommands = new Map<string, CertificateCommandDescriptor>();

export function listRegisteredCertificateCommands(): CertificateCommandDescriptor[] {
  return [...registeredCertificateCommands.values()];
}

export function createServer(options: OttoServerOptions = {}): OttoServer {
  const server = Fastify({ logger: options.logger ?? false });
  const moduleHost = new ModuleHost();
  const updateHost = new UpdateHost();
  const certificateService = createCertificateLifecycleService(options.certificates);

  registerCertificateCommands(
    {
      register(descriptor) {
        registeredCertificateCommands.set(descriptor.id, descriptor);
      }
    },
    certificateService
  );
  for (const descriptor of CERTIFICATE_COMMAND_DESCRIPTORS) {
    registeredCertificateCommands.set(descriptor.id, descriptor);
  }
  void certificateService.initialize();

  moduleHost.register({ id: "core.shell", name: "Core Shell", version: "0.2.1" });
  updateHost.set({ channel: "stable", currentVersion: "0.2.1", targetVersion: "0.2.1" });

  registerHealthRoutes(server);
  registerModuleRoutes(server);
  registerUpdateRoutes(server);

  server.get("/", async () => ({ status: "ready" }));

  return server;
}
