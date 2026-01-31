import "dotenv/config";
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const connectionString = `${process.env.DATABASE_URL}`
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Only seed admin account as per requirements
  const adminEmail = "admin@skillbridge.local";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN", status: "ACTIVE" },
    create: {
      name: "SkillBridge Admin",
      email: adminEmail,
      emailVerified: false,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  console.log("Admin user created:", admin.email, "role:", admin.role);
  console.log("Note: Categories should be created dynamically by Admin via /api/admin/categories");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });