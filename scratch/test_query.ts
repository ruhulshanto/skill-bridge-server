import { prisma } from '../src/lib/prisma';

async function main() {
  const gte4 = await prisma.user.findMany({
    where: {
      role: 'TUTOR',
      tutorProfile: {
        rating: { gte: 4 }
      }
    },
    include: { tutorProfile: true }
  });
  
  console.log("Tutors with rating >= 4:");
  gte4.forEach(t => {
    console.log(`- ${t.name}: ${t.tutorProfile?.rating} stars`);
  });

  const allTutors = await prisma.user.findMany({
    where: { role: 'TUTOR' },
    include: { tutorProfile: true },
    orderBy: { tutorProfile: { rating: 'desc' } }
  });

  console.log("\nAll Tutors:");
  allTutors.forEach(t => {
    console.log(`- ${t.name}: ${t.tutorProfile?.rating} stars`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
