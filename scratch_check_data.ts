
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const tutors = await prisma.user.findMany({
    where: { role: 'TUTOR' },
    include: {
      tutorProfile: true
    }
  });

  console.log('Tutors in Database:');
  tutors.forEach(t => {
    console.log(`- ${t.name} (ID: ${t.id})`);
    console.log(`  Hourly Rate (Cents): ${t.tutorProfile?.hourlyRate}`);
    console.log(`  Profile ID: ${t.tutorProfile?.id}`);
  });

  const bookings = await prisma.booking.findMany({
    include: {
      tutor: {
        include: {
          user: true
        }
      }
    }
  });

  console.log('\nBookings in Database:');
  bookings.forEach(b => {
    console.log(`- Booking ID: ${b.id}`);
    console.log(`  Tutor: ${b.tutor.user.name}`);
    console.log(`  Total Amount (Cents): ${b.totalAmount}`);
    console.log(`  Tutor Rate (Cents): ${b.tutor.hourlyRate}`);
  });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
