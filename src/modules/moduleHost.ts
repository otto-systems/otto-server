export type HostedModule = {
  id: string;
  name: string;
  version: string;
};

export class ModuleHost {
  private readonly modules = new Map<string, HostedModule>();

  register(module: HostedModule): void {
    this.modules.set(module.id, module);
  }

  list(): HostedModule[] {
    return [...this.modules.values()];
  }
}
