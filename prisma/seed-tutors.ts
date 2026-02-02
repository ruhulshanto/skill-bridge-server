import "dotenv/config";
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const connectionString = `${process.env.DATABASE_URL}`
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Creating sample tutors...");

  // Create sample subjects first
  const mathSubject = await prisma.subject.upsert({
    where: { slug: "mathematics" },
    update: { name: "Mathematics" },
    create: { name: "Mathematics", slug: "mathematics" }
  });

  const csSubject = await prisma.subject.upsert({
    where: { slug: "computer-science" },
    update: { name: "Computer Science" },
    create: { name: "Computer Science", slug: "computer-science" }
  });

  const englishSubject = await prisma.subject.upsert({
    where: { slug: "english" },
    update: { name: "English" },
    create: { name: "English", slug: "english" }
  });

  const physicsSubject = await prisma.subject.upsert({
    where: { slug: "physics" },
    update: { name: "Physics" },
    create: { name: "Physics", slug: "physics" }
  });

  // Create sample tutors
  const tutors = [
    {
      name: "Sarah Johnson",
      email: "sarah.johnson@skillbridge.local",
      bio: "I am a passionate mathematics educator with a Master's degree in Applied Mathematics.",
      hourlyRate: 45,
      experience: 7,
      education: "M.S. Applied Mathematics, Columbia University, 2018",
      subjects: [mathSubject.id]
    },
    {
      name: "David Chen",
      email: "david.chen@skillbridge.local",
      bio: "Senior Software Engineer with experience at top tech companies. I love teaching coding.",
      hourlyRate: 60,
      experience: 5,
      education: "B.S. Computer Science, Stanford University, 2019",
      subjects: [csSubject.id]
    },
    {
      name: "Emily Davis",
      email: "emily.davis@skillbridge.local",
      bio: "As a published author and literature enthusiast, I help students find their voice in writing.",
      hourlyRate: 35,
      experience: 8,
      education: "M.A. English Literature, Oxford University, 2017",
      subjects: [englishSubject.id]
    },
    {
      name: "Michael Wilson",
      email: "michael.wilson@skillbridge.local",
      bio: "I believe physics is for everyone. My goal is to demystify complex physical concepts.",
      hourlyRate: 55,
      experience: 4,
      education: "Ph.D. Physics (Candidate), MIT, Present",
      subjects: [physicsSubject.id]
    }
  ];

  for (const tutorData of tutors) {
    const user = await prisma.user.create({
      data: {
        name: tutorData.name,
        email: tutorData.email,
        emailVerified: true,
        role: "TUTOR",
        status: "ACTIVE",
        tutorProfile: {
          create: {
            bio: tutorData.bio,
            hourlyRate: tutorData.hourlyRate,
            experience: tutorData.experience,
            education: tutorData.education,
            isVerified: true,
            subjects: {
              create: tutorData.subjects.map(subjectId => ({
                subjectId
              }))
            }
          }
        }
      }
    });

    console.log("Created tutor:", user.name, user.email);
  }

  console.log("Sample tutors created successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
