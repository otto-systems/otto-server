import type {
  CertificateLifecycleService,
  CertificateStatusInput,
  CreateCertificateInput,
  RevokeCertificateInput,
  RotateCertificateInput
} from "./service.js";

export interface CertificateCommandDescriptor {
  id: "certificate.create" | "certificate.rotate" | "certificate.revoke" | "certificate.ca" | "certificate.status";
  description: string;
  permission: string;
}

export interface CertificateCommandRegistrar {
  register<TInput, TOutput>(
    descriptor: CertificateCommandDescriptor,
    handler: (input: TInput) => Promise<TOutput>
  ): void;
}

export const CERTIFICATE_COMMAND_DESCRIPTORS: CertificateCommandDescriptor[] = [
  {
    id: "certificate.create",
    description: "Issue a certificate for a subject through the Otto certificate lifecycle service.",
    permission: "certificate:write"
  },
  {
    id: "certificate.rotate",
    description: "Rotate an existing certificate through the Otto certificate lifecycle service.",
    permission: "certificate:write"
  },
  {
    id: "certificate.revoke",
    description: "Revoke a certificate and append it to the revocation list.",
    permission: "certificate:admin"
  },
  {
    id: "certificate.ca",
    description: "Read the active root/intermediate CA chain.",
    permission: "certificate:read"
  },
  {
    id: "certificate.status",
    description: "Get lifecycle status for a subject or certificate id.",
    permission: "certificate:read"
  }
];

export function registerCertificateCommands(registrar: CertificateCommandRegistrar, service: CertificateLifecycleService): void {
  registrar.register<CreateCertificateInput, Awaited<ReturnType<CertificateLifecycleService["create_certificate"]>>>(
    CERTIFICATE_COMMAND_DESCRIPTORS[0],
    (input) => service.create_certificate(input)
  );

  registrar.register<RotateCertificateInput, Awaited<ReturnType<CertificateLifecycleService["rotate_certificate"]>>>(
    CERTIFICATE_COMMAND_DESCRIPTORS[1],
    (input) => service.rotate_certificate(input)
  );

  registrar.register<RevokeCertificateInput, Awaited<ReturnType<CertificateLifecycleService["revoke_certificate"]>>>(
    CERTIFICATE_COMMAND_DESCRIPTORS[2],
    (input) => service.revoke_certificate(input)
  );

  registrar.register<Record<string, never>, Awaited<ReturnType<CertificateLifecycleService["get_ca_chain"]>>>(
    CERTIFICATE_COMMAND_DESCRIPTORS[3],
    () => service.get_ca_chain()
  );

  registrar.register<CertificateStatusInput, Awaited<ReturnType<CertificateLifecycleService["get_certificate_status"]>>>(
    CERTIFICATE_COMMAND_DESCRIPTORS[4],
    (input) => service.get_certificate_status(input)
  );
}
