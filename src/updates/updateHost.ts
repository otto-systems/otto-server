export type HostedUpdate = {
  channel: string;
  currentVersion: string;
  targetVersion: string;
};

export class UpdateHost {
  current?: HostedUpdate;

  set(update: HostedUpdate): void {
    this.current = update;
  }
}
