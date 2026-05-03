import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkNotifications() {
  try {
    const count = await (prisma as any).notification.count();
    console.log("Total Notifications:", count);

    const latest = await (prisma as any).notification.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, role: true } } }
    });
    console.log("Latest Notifications:", JSON.stringify(latest, null, 2));

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true, name: true }
    });
    console.log("Admin Users:", admins);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkNotifications();
