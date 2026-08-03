import type { UpdateManifest } from "@otto/protocol";

const courseForgeUpdateManifest: UpdateManifest = {
  product: "courseforge",
  channel: "stable",
  currentVersion: "0.1.2",
  targetVersion: "0.1.2",
  publishedAt: "2026-08-02T00:00:00Z",
  artifacts: [
    {
      name: "courseforge-0.1.2-win32-x64.zip",
      url: "https://updates.courseforge.local/releases/0.1.2/courseforge-0.1.2-win32-x64.zip",
      checksum: "sha256:pending"
    }
  ]
};

export function registerUpdateRoutes(server: { get: (path: string, handler: () => Promise<unknown> | unknown) => void }): void {
  server.get("/updates", async () => courseForgeUpdateManifest);
}
