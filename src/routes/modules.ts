export function registerModuleRoutes(server: { get: (path: string, handler: () => Promise<unknown> | unknown) => void }): void {
  server.get("/modules", async () => ({
    modules: [
      { id: "core.shell", name: "Core Shell", version: "0.2.1" },
      { id: "ext.sync", name: "Sync Extension", version: "0.2.1" }
    ]
  }));
}
