import fs from "node:fs/promises";
import path from "node:path";

interface RuntimeStateManager {
  load: () => Promise<Record<string, unknown>>;
  save: (value: Record<string, unknown>) => Promise<void>;
}

type RuntimeStateManagerCtor = new (storagePath: string, version: string) => RuntimeStateManager;

function resolveStateManagerCtor(): RuntimeStateManagerCtor | null {
  const candidate = (globalThis as { StateManager?: RuntimeStateManagerCtor }).StateManager;
  return typeof candidate === "function" ? candidate : null;
}

async function ensureFile(targetPath: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await fs.access(targetPath);
  } catch {
    await fs.writeFile(targetPath, "{}\n", { mode: 0o600 });
  }

  try {
    await fs.chmod(targetPath, 0o600);
  } catch {
    // Best effort on platforms that do not support chmod semantics.
  }
}

export interface SecureStorage {
  readSecret(key: string): Promise<string | null>;
  writeSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
}

class StateManagerSecureStorage implements SecureStorage {
  constructor(private readonly manager: RuntimeStateManager) {}

  async readSecret(key: string): Promise<string | null> {
    const state = await this.manager.load();
    const raw = state?.[key];
    return typeof raw === "string" ? raw : null;
  }

  async writeSecret(key: string, value: string): Promise<void> {
    const state = await this.manager.load();
    await this.manager.save({ ...state, [key]: value });
  }

  async deleteSecret(key: string): Promise<void> {
    const state = await this.manager.load();
    const nextState = { ...state };
    delete nextState[key];
    await this.manager.save(nextState);
  }
}

class FileSecureStorage implements SecureStorage {
  constructor(private readonly storagePath: string) {}

  private async readState(): Promise<Record<string, string>> {
    await ensureFile(this.storagePath);
    try {
      const raw = await fs.readFile(this.storagePath, "utf8");
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
    } catch {
      return {};
    }
  }

  private async writeState(state: Record<string, string>): Promise<void> {
    await ensureFile(this.storagePath);
    await fs.writeFile(this.storagePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    try {
      await fs.chmod(this.storagePath, 0o600);
    } catch {
      // Best effort on platforms that do not support chmod semantics.
    }
  }

  async readSecret(key: string): Promise<string | null> {
    const state = await this.readState();
    return typeof state[key] === "string" ? state[key] : null;
  }

  async writeSecret(key: string, value: string): Promise<void> {
    const state = await this.readState();
    state[key] = value;
    await this.writeState(state);
  }

  async deleteSecret(key: string): Promise<void> {
    const state = await this.readState();
    delete state[key];
    await this.writeState(state);
  }
}

export function createSecureStorage(storagePath: string): SecureStorage {
  const StateManagerCtor = resolveStateManagerCtor();
  if (StateManagerCtor) {
    return new StateManagerSecureStorage(new StateManagerCtor(storagePath, "1.0.0"));
  }

  return new FileSecureStorage(storagePath);
}
