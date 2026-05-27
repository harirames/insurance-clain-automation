import { prisma } from "@/lib/db";

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: "MEMBER" | "OPS";
  memberId: string | null;
  name: string;
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      role: true,
      memberId: true,
      name: true,
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    passwordHash: user.passwordHash,
    role: user.role as "MEMBER" | "OPS",
    memberId: user.memberId,
    name: user.name,
  };
}
