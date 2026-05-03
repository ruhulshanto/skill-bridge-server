
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
      tutorProfile: {
        include: {
          subjects: {
            include: {
              subject: true,
            },
          },
        },
      },
    },
  });

  const tutorsWithDollars = tutors.map((tutor) => {
    const plainTutor = JSON.parse(JSON.stringify(tutor));
    if (plainTutor.tutorProfile) {
      plainTutor.tutorProfile.hourlyRate = plainTutor.tutorProfile.hourlyRate / 100;
    }
    return plainTutor;
  });

  console.log('--- API SIMULATION: GET /api/tutors ---');
  tutorsWithDollars.forEach(t => {
    if (t.name === 'Lisa Wang' || t.name === 'Li Wei' || t.name === 'Michael Wilson') {
      console.log(`Tutor: ${t.name}`);
      console.log(`Hourly Rate (after /100): ${t.tutorProfile?.hourlyRate}`);
    }
  });

  const bookings = await prisma.booking.findMany({
    where: {
      tutor: {
        user: {
          name: 'Li Wei'
        }
      }
    },
    include: {
      tutor: {
        include: {
          user: true
        }
      }
    }
  });

  console.log('\n--- API SIMULATION: GET /api/bookings (for Li Wei sessions) ---');
  bookings.forEach(b => {
    const bWithDollars = {
      ...b,
      totalAmount: b.totalAmount / 100,
      tutor: b.tutor ? {
        ...b.tutor,
        hourlyRate: b.tutor.hourlyRate / 100
      } : null
    };
    console.log(`Booking ID: ${b.id}`);
    console.log(`Tutor: ${b.tutor.user.name}`);
    console.log(`Total Amount (after /100): ${bWithDollars.totalAmount}`);
    console.log(`Tutor Hourly Rate (after /100): ${bWithDollars.tutor?.hourlyRate}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
