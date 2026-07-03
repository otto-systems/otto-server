export function registerHealthRoutes(server: { get: (path: string, handler: () => Promise<{ status: string }> | { status: string }) => void }): void {
  server.get("/health", async () => ({ status: "ok" }));
}
