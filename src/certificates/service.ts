import fs from "node:fs/promises";
import path from "node:path";
import { createHash, createPublicKey, generateKeyPairSync, randomUUID } from "node:crypto";
import { createSecureStorage, type SecureStorage } from "./secureStorage.js";

type CertificateState = "active" | "rotated" | "revoked";

export interface CertificateRecord {
  certificateId: string;
  subject: string;
  serialNumber: string;
  status: CertificateState;
  issuedAt: string;
  expiresAt: string;
  rotationDueAt: string;
  certificatePem: string;
  caChain: string[];
  keySecretRef: string;
  revokedAt?: string;
  revokeReason?: string;
}

export interface RevocationEntry {
  certificateId: string;
  serialNumber: string;
  revokedAt: string;
  reason: string;
}

interface CaNode {
  certificatePem: string;
  keySecretRef: string;
  createdAt: string;
  expiresAt: string;
  thumbprint: string;
}

interface CaState {
  root: CaNode;
  intermediate: CaNode;
}

export interface CreateCertificateInput {
  subject: string;
  validityDays?: number;
}

export interface RotateCertificateInput {
  certificateId?: string;
  subject?: string;
  validityDays?: number;
}

export interface RevokeCertificateInput {
  certificateId: string;
  reason?: string;
}

export interface CertificateStatusInput {
  certificateId?: string;
  subject?: string;
}

export interface CertificateStatusResult {
  exists: boolean;
  certificate?: CertificateRecord;
  rotateRequired: boolean;
  reason?: string;
}

export interface IssuedCertificate {
  certificate: CertificateRecord;
  privateKeyPem: string;
}

export interface CertificateLifecycleConfig {
  storageRoot?: string;
  caStatePath?: string;
  registryPath?: string;
  revocationPath?: string;
  secureStorePath?: string;
  rotationIntervalMs?: number;
  defaultValidityDays?: number;
}

function defaultConfig(): Required<CertificateLifecycleConfig> {
  const storageRoot = process.env.OTTO_CA_STORAGE_DIR ?? path.resolve(process.cwd(), "mempalace", "certificates");
  return {
    storageRoot,
    caStatePath: path.join(storageRoot, "ca-state.json"),
    registryPath: path.join(storageRoot, "registry.json"),
    revocationPath: path.join(storageRoot, "revocations.json"),
    secureStorePath: process.env.OTTO_CERT_SECURE_STORE_PATH ?? path.join(storageRoot, "secure-secrets.json"),
    rotationIntervalMs: Number(process.env.OTTO_CA_ROTATION_INTERVAL_MS ?? 1000 * 60 * 60 * 24 * 7),
    defaultValidityDays: Number(process.env.OTTO_CERT_DEFAULT_VALIDITY_DAYS ?? 30)
  };
}

async function readJsonOrDefault<T>(targetPath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(targetPath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

function makeThumbprint(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function asPemBlock(type: string, content: string): string {
  const chunks = content.match(/.{1,64}/g) ?? [content];
  return `-----BEGIN ${type}-----\n${chunks.join("\n")}\n-----END ${type}-----\n`;
}

function createSyntheticCertificatePem(subject: string, issuer: string, serialNumber: string, issuedAt: string, expiresAt: string): string {
  const payload = Buffer.from(JSON.stringify({ subject, issuer, serialNumber, issuedAt, expiresAt })).toString("base64");
  return asPemBlock("CERTIFICATE", payload);
}

function createPrivateKeyPem(): { privateKeyPem: string; publicKeyPem: string } {
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  return {
    privateKeyPem: pair.privateKey,
    publicKeyPem: pair.publicKey
  };
}

function serialFromPublicKey(publicKeyPem: string): string {
  const publicKey = createPublicKey(publicKeyPem);
  const der = publicKey.export({ format: "der", type: "spki" });
  return createHash("sha1").update(der).digest("hex").slice(0, 16);
}

export class CertificateLifecycleService {
  private readonly config: Required<CertificateLifecycleConfig>;
  private readonly secureStorage: SecureStorage;

  constructor(config: CertificateLifecycleConfig = {}) {
    this.config = { ...defaultConfig(), ...config };
    this.secureStorage = createSecureStorage(this.config.secureStorePath);
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.config.storageRoot, { recursive: true });
    const ca = await this.loadOrCreateCaState();
    await this.writeCaState(ca);

    const registry = await this.loadRegistry();
    await this.writeRegistry(registry);

    const revocations = await this.loadRevocations();
    await this.writeRevocations(revocations);
  }

  async create_certificate(input: CreateCertificateInput): Promise<IssuedCertificate> {
    await this.initialize();

    const subject = String(input.subject || "").trim();
    if (!subject) {
      throw new Error("subject is required");
    }

    const validityDays = Math.max(1, Number(input.validityDays ?? this.config.defaultValidityDays));
    const now = Date.now();
    const issuedAt = toIso(now);
    const expiresAt = toIso(now + validityDays * 24 * 60 * 60 * 1000);
    const rotationDueAt = toIso(now + this.config.rotationIntervalMs);
    const certificateId = randomUUID();
    const { privateKeyPem, publicKeyPem } = createPrivateKeyPem();
    const serialNumber = serialFromPublicKey(publicKeyPem);
    const ca = await this.loadOrCreateCaState();
    const certificatePem = createSyntheticCertificatePem(subject, "otto-intermediate", serialNumber, issuedAt, expiresAt);
    const keySecretRef = `cert.key.${certificateId}`;

    await this.secureStorage.writeSecret(keySecretRef, privateKeyPem);

    const record: CertificateRecord = {
      certificateId,
      subject,
      serialNumber,
      status: "active",
      issuedAt,
      expiresAt,
      rotationDueAt,
      certificatePem,
      caChain: [ca.intermediate.certificatePem, ca.root.certificatePem],
      keySecretRef
    };

    const registry = await this.loadRegistry();
    for (const existing of registry) {
      if (existing.subject === subject && existing.status === "active") {
        existing.status = "rotated";
      }
    }

    registry.push(record);
    await this.writeRegistry(registry);

    return { certificate: record, privateKeyPem };
  }

  async rotate_certificate(input: RotateCertificateInput): Promise<IssuedCertificate> {
    await this.initialize();
    const registry = await this.loadRegistry();

    let target: CertificateRecord | undefined;
    if (input.certificateId) {
      target = registry.find((entry) => entry.certificateId === input.certificateId);
    } else if (input.subject) {
      target = registry.find((entry) => entry.subject === input.subject && entry.status === "active");
    }

    const subject = target?.subject ?? String(input.subject || "").trim();
    if (!subject) {
      throw new Error("subject or certificateId is required for rotation");
    }

    if (target) {
      target.status = "rotated";
    }

    await this.writeRegistry(registry);
    return this.create_certificate({ subject, validityDays: input.validityDays });
  }

  async revoke_certificate(input: RevokeCertificateInput): Promise<{ ok: boolean; certificateId: string; revokedAt: string }> {
    await this.initialize();
    const registry = await this.loadRegistry();
    const target = registry.find((entry) => entry.certificateId === input.certificateId);

    if (!target) {
      throw new Error(`certificate not found: ${input.certificateId}`);
    }

    if (target.status === "revoked") {
      return { ok: true, certificateId: target.certificateId, revokedAt: target.revokedAt ?? new Date().toISOString() };
    }

    const revokedAt = new Date().toISOString();
    target.status = "revoked";
    target.revokedAt = revokedAt;
    target.revokeReason = String(input.reason || "manual-revocation");

    const revocations = await this.loadRevocations();
    revocations.push({
      certificateId: target.certificateId,
      serialNumber: target.serialNumber,
      revokedAt,
      reason: target.revokeReason
    });

    await this.writeRegistry(registry);
    await this.writeRevocations(revocations);
    await this.secureStorage.deleteSecret(target.keySecretRef);

    return { ok: true, certificateId: target.certificateId, revokedAt };
  }

  async get_ca_chain(): Promise<{ chain: string[]; rootThumbprint: string; intermediateThumbprint: string }> {
    const ca = await this.loadOrCreateCaState();
    return {
      chain: [ca.intermediate.certificatePem, ca.root.certificatePem],
      rootThumbprint: ca.root.thumbprint,
      intermediateThumbprint: ca.intermediate.thumbprint
    };
  }

  async get_certificate_status(input: CertificateStatusInput): Promise<CertificateStatusResult> {
    await this.initialize();
    const registry = await this.loadRegistry();

    const target = input.certificateId
      ? registry.find((entry) => entry.certificateId === input.certificateId)
      : registry.find((entry) => entry.subject === input.subject && entry.status === "active");

    if (!target) {
      return { exists: false, rotateRequired: true, reason: "missing" };
    }

    const now = Date.now();
    const rotateRequired = target.status !== "active"
      || Date.parse(target.rotationDueAt) <= now
      || Date.parse(target.expiresAt) <= now;

    return {
      exists: true,
      certificate: target,
      rotateRequired,
      reason: rotateRequired ? "expired-or-rotation-window" : "active"
    };
  }

  async readPrivateKey(secretRef: string): Promise<string | null> {
    return this.secureStorage.readSecret(secretRef);
  }

  private async loadOrCreateCaState(): Promise<CaState> {
    const existing = await readJsonOrDefault<CaState | null>(this.config.caStatePath, null);
    if (existing?.root?.certificatePem && existing?.intermediate?.certificatePem) {
      return existing;
    }

    const now = Date.now();
    const rootPair = createPrivateKeyPem();
    const rootSerial = serialFromPublicKey(rootPair.publicKeyPem);
    const rootIssuedAt = toIso(now);
    const rootExpiresAt = toIso(now + 365 * 24 * 60 * 60 * 1000);
    const rootCert = createSyntheticCertificatePem("CN=Otto Root CA", "CN=Otto Root CA", rootSerial, rootIssuedAt, rootExpiresAt);
    const rootKeyRef = "ca.root.private-key";
    await this.secureStorage.writeSecret(rootKeyRef, rootPair.privateKeyPem);

    const intermediatePair = createPrivateKeyPem();
    const intermediateSerial = serialFromPublicKey(intermediatePair.publicKeyPem);
    const intermediateIssuedAt = toIso(now);
    const intermediateExpiresAt = toIso(now + 180 * 24 * 60 * 60 * 1000);
    const intermediateCert = createSyntheticCertificatePem("CN=Otto Intermediate CA", "CN=Otto Root CA", intermediateSerial, intermediateIssuedAt, intermediateExpiresAt);
    const intermediateKeyRef = "ca.intermediate.private-key";
    await this.secureStorage.writeSecret(intermediateKeyRef, intermediatePair.privateKeyPem);

    return {
      root: {
        certificatePem: rootCert,
        keySecretRef: rootKeyRef,
        createdAt: rootIssuedAt,
        expiresAt: rootExpiresAt,
        thumbprint: makeThumbprint(rootCert)
      },
      intermediate: {
        certificatePem: intermediateCert,
        keySecretRef: intermediateKeyRef,
        createdAt: intermediateIssuedAt,
        expiresAt: intermediateExpiresAt,
        thumbprint: makeThumbprint(intermediateCert)
      }
    };
  }

  private async loadRegistry(): Promise<CertificateRecord[]> {
    const raw = await readJsonOrDefault<CertificateRecord[] | null>(this.config.registryPath, []);
    return Array.isArray(raw) ? raw : [];
  }

  private async writeRegistry(entries: CertificateRecord[]): Promise<void> {
    await writeJson(this.config.registryPath, entries);
  }

  private async loadRevocations(): Promise<RevocationEntry[]> {
    const raw = await readJsonOrDefault<RevocationEntry[] | null>(this.config.revocationPath, []);
    return Array.isArray(raw) ? raw : [];
  }

  private async writeRevocations(entries: RevocationEntry[]): Promise<void> {
    await writeJson(this.config.revocationPath, entries);
  }

  private async writeCaState(state: CaState): Promise<void> {
    await writeJson(this.config.caStatePath, state);
  }
}

let singleton: CertificateLifecycleService | null = null;

export function createCertificateLifecycleService(config: CertificateLifecycleConfig = {}): CertificateLifecycleService {
  return new CertificateLifecycleService(config);
}

export function getCertificateLifecycleService(config: CertificateLifecycleConfig = {}): CertificateLifecycleService {
  if (!singleton) {
    singleton = new CertificateLifecycleService(config);
  }

  return singleton;
}
