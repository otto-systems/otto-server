import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createCertificateLifecycleService,
  createServer,
  listRegisteredCertificateCommands
} from "../src/index.js";

async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("certificate lifecycle", () => {
  it("issues, rotates, and revokes certificates", async () => {
    const tmpRoot = await createTempDir("otto-server-cert-");
    const service = createCertificateLifecycleService({
      storageRoot: tmpRoot,
      secureStorePath: path.join(tmpRoot, "secure-secrets.json"),
      rotationIntervalMs: 10
    });

    const issued = await service.create_certificate({ subject: "display-device-01", validityDays: 2 });
    expect(issued.certificate.subject).toBe("display-device-01");
    expect(issued.privateKeyPem).toContain("BEGIN PRIVATE KEY");

    const statusBeforeRotate = await service.get_certificate_status({ subject: "display-device-01" });
    expect(statusBeforeRotate.exists).toBe(true);
    expect(statusBeforeRotate.certificate?.status).toBe("active");

    const rotated = await service.rotate_certificate({ subject: "display-device-01" });
    expect(rotated.certificate.certificateId).not.toBe(issued.certificate.certificateId);

    const statusAfterRotate = await service.get_certificate_status({ certificateId: rotated.certificate.certificateId });
    expect(statusAfterRotate.exists).toBe(true);
    expect(statusAfterRotate.certificate?.status).toBe("active");

    const revoked = await service.revoke_certificate({ certificateId: rotated.certificate.certificateId, reason: "test" });
    expect(revoked.ok).toBe(true);

    const statusAfterRevoke = await service.get_certificate_status({ certificateId: rotated.certificate.certificateId });
    expect(statusAfterRevoke.exists).toBe(true);
    expect(statusAfterRevoke.certificate?.status).toBe("revoked");
    expect(statusAfterRevoke.rotateRequired).toBe(true);

    const chain = await service.get_ca_chain();
    expect(chain.chain.length).toBe(2);
    expect(chain.chain[0]).toContain("BEGIN CERTIFICATE");
  });

  it("registers certificate command descriptors during server startup", async () => {
    const tmpRoot = await createTempDir("otto-server-startup-");
    const server = createServer({
      certificates: {
        storageRoot: tmpRoot,
        secureStorePath: path.join(tmpRoot, "secure-secrets.json")
      }
    });

    const commandIds = listRegisteredCertificateCommands().map((entry) => entry.id);
    expect(commandIds).toEqual(expect.arrayContaining([
      "certificate.create",
      "certificate.rotate",
      "certificate.revoke",
      "certificate.ca",
      "certificate.status"
    ]));

    await server.close();
  });
});
