import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// Mock prisma before importing anything that uses it
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { findUserByUsername } from "@/lib/storage/usersRepo";

const MEMBER_PASSWORD_HASH =
  "$2b$10$cqxViV7VKgoIyWKpFireteQ4CiEKuyREsbUrt5F7nIt7hYVAfEhCC"; // "password123"
const OPS_PASSWORD_HASH =
  "$2b$10$Oa9QaOA/POpRY.fGii/Qa.0a6qB5/bGKDgcPN0otDW3UkaeaCqsUu"; // "opspass123"

const mockMember = {
  id: "clm_emp001",
  username: "EMP001",
  passwordHash: MEMBER_PASSWORD_HASH,
  role: "MEMBER",
  memberId: "EMP001",
  name: "Rajesh Kumar",
};

const mockOpsUser = {
  id: "clm_ops001",
  username: "ops@plum.test",
  passwordHash: OPS_PASSWORD_HASH,
  role: "OPS",
  memberId: null,
  name: "Ops Admin",
};

// Replicate the authorize logic against the repo function
async function authorize(username: string, password: string) {
  const user = await findUserByUsername(username);
  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;
  return { id: user.id, name: user.name, role: user.role, memberId: user.memberId };
}

describe("authorize() via usersRepo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves a known member with correct password", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockMember);
    const result = await authorize("EMP001", "password123");
    expect(result).not.toBeNull();
    expect(result?.role).toBe("MEMBER");
    expect(result?.id).toBe("clm_emp001");
    expect(result?.memberId).toBe("EMP001");
  });

  it("rejects a known member with wrong password", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockMember);
    const result = await authorize("EMP001", "wrongpassword");
    expect(result).toBeNull();
  });

  it("resolves the OPS user with correct password", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpsUser);
    const result = await authorize("ops@plum.test", "opspass123");
    expect(result).not.toBeNull();
    expect(result?.role).toBe("OPS");
    expect(result?.memberId).toBeNull();
  });

  it("rejects the OPS user with wrong password", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockOpsUser);
    const result = await authorize("ops@plum.test", "wrongpassword");
    expect(result).toBeNull();
  });

  it("rejects an unknown username", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await authorize("UNKNOWN999", "password123");
    expect(result).toBeNull();
  });
});
