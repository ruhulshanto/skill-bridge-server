
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- LISA WANG CHECK ---');
  const lisaWangs = await prisma.user.findMany({
    where: { name: { contains: 'Lisa Wang', mode: 'insensitive' } },
    include: { tutorProfile: true }
  });

  lisaWangs.forEach(l => {
    console.log(`User: ${l.name} (${l.email})`);
    console.log(`Role: ${l.role}`);
    console.log(`Hourly Rate (Cents): ${l.tutorProfile?.hourlyRate}`);
  });

  console.log('\n--- BOOKINGS FOR STUDENT ---');
  const bookings = await prisma.booking.findMany({
    include: {
      tutor: { include: { user: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  bookings.forEach(b => {
    console.log(`Booking ID: ${b.id}`);
    console.log(`Tutor: ${b.tutor.user.name}`);
    console.log(`Date: ${b.date}`);
    console.log(`Total Amount (Cents): ${b.totalAmount}`);
    console.log(`Tutor Hourly Rate (Cents): ${b.tutor.hourlyRate}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
