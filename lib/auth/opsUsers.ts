// Demo OPS accounts — only bcrypt hashes are stored here, never plaintext
// Credentials: ops@plum.test / opspass123
export const OPS_USERS = [
  {
    id: "ops-001",
    username: "ops@plum.test",
    name: "Ops Admin",
    // bcrypt hash of "opspass123"
    passwordHash: "$2b$10$Oa9QaOA/POpRY.fGii/Qa.0a6qB5/bGKDgcPN0otDW3UkaeaCqsUu",
  },
] as const;
