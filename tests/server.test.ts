import { afterAll, describe, expect, it } from "vitest";

import { createServer } from "../src/server/server.js";

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
    expect(response.json().targetVersion).toBe("0.2.1");
  });
});
