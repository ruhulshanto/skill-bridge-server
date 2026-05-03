import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkStatus() {
  try {
    const notifs = await (prisma as any).notification.count();
    console.log("Total Notifications:", notifs);

    const apps = await prisma.tutorApplication.count();
    console.log("Total Tutor Applications:", apps);

    const latestApp = await prisma.tutorApplication.findFirst({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } }
    });
    console.log("Latest Application:", latestApp ? {
      name: latestApp.user.name,
      status: latestApp.status,
      createdAt: latestApp.createdAt
    } : "None");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStatus();
