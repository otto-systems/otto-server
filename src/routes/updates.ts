export function registerUpdateRoutes(server: { get: (path: string, handler: () => Promise<unknown> | unknown) => void }): void {
  server.get("/updates", async () => ({
    product: "otto-system",
    channel: "stable",
    currentVersion: "0.2.1",
    targetVersion: "0.2.1",
    publishedAt: "2026-07-03T00:00:00Z",
    artifacts: [
      {
        name: "otto-system-0.2.1-macos-arm64.tar.gz",
        url: "https://updates.otto.local/releases/0.2.1/otto-system-0.2.1-macos-arm64.tar.gz",
        checksum: "sha256:pending"
      }
    ]
  }));
}
