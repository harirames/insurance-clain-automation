import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// All demo members share this hash of "password123"
const MEMBER_PASSWORD_HASH =
  "$2b$10$cqxViV7VKgoIyWKpFireteQ4CiEKuyREsbUrt5F7nIt7hYVAfEhCC";
// Hash of "opspass123"
const OPS_PASSWORD_HASH =
  "$2b$10$Oa9QaOA/POpRY.fGii/Qa.0a6qB5/bGKDgcPN0otDW3UkaeaCqsUu";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const policyPath = join(__dirname, "../policy_terms.json");
    const policy = JSON.parse(readFileSync(policyPath, "utf-8")) as {
      members: Array<{ member_id: string; name: string }>;
    };

    console.log(`Seeding ${policy.members.length} members…`);
    for (const member of policy.members) {
      await prisma.user.upsert({
        where: { username: member.member_id },
        update: { name: member.name },
        create: {
          username: member.member_id,
          passwordHash: MEMBER_PASSWORD_HASH,
          role: "MEMBER",
          memberId: member.member_id,
          name: member.name,
        },
      });
    }

    console.log("Seeding OPS user…");
    await prisma.user.upsert({
      where: { username: "ops@plum.test" },
      update: {},
      create: {
        username: "ops@plum.test",
        passwordHash: OPS_PASSWORD_HASH,
        role: "OPS",
        name: "Ops Admin",
      },
    });

    console.log("Seed complete.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
