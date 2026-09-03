import { afterAll, describe, expect, it } from "vitest";

import { createNodeServer, createServer } from "../src/server/server.js";

const server = createServer();

afterAll(async () => {
  await server.close();
});

describe("server routes", () => {
  it("returns health status", async () => {
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns module list", async () => {
    const response = await server.inject({ method: "GET", url: "/modules" });

    expect(response.statusCode).toBe(200);
    expect(response.json().modules.length).toBeGreaterThan(0);
  });

  it("returns update descriptor", async () => {
    const response = await server.inject({ method: "GET", url: "/updates" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      product: "courseforge",
      channel: "stable",
      targetVersion: "0.1.2"
    });
    expect(response.json().artifacts?.[0]?.name).toBe("courseforge-0.1.2-win32-x64.zip");
  });

  it("creates a Node HTTP listener for OAuth-facing services", async () => {
    const nodeServer = await createNodeServer({
      requestListener: (request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, url: request.url }));
      }
    });

    await new Promise<void>((resolve) => {
      nodeServer.listen(0, "127.0.0.1", () => resolve());
    });

    const address = nodeServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/oauth/callback?provider=microsoft`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, url: "/oauth/callback?provider=microsoft" });

    await new Promise<void>((resolve, reject) => {
      nodeServer.close((error) => error ? reject(error) : resolve());
    });
  });
});
