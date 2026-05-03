import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function runDiagnosis() {
  console.log("🔍 Tutor Data Diagnosis Report\n");
  console.log("=".repeat(60));

  // Count TUTOR users
  const tutorUserCount = await prisma.user.count({
    where: { role: "TUTOR" },
  });

  // Count TutorProfiles
  const tutorProfileCount = await prisma.tutorProfile.count();

  console.log(`\n📈 Summary:`);
  console.log(`   Users with role TUTOR: ${tutorUserCount}`);
  console.log(`   TutorProfile records: ${tutorProfileCount}`);

  if (tutorUserCount !== tutorProfileCount) {
    console.log(`   ⚠️  MISMATCH: ${tutorUserCount - tutorProfileCount} tutors lack profiles`);
  }

  // Find tutors (users with role TUTOR) and their image field
  const tutors = await prisma.user.findMany({
    where: { role: "TUTOR" },
    include: {
      tutorProfile: {
        include: {
          subjects: {
            include: { subject: true },
          },
          availability: true,
        },
      },
    },
    orderBy: [
      { tutorProfile: { isVerified: "desc" } } as any,
      { tutorProfile: { rating: "desc" } } as any,
      { name: "asc" } as any,
    ],
  });

  console.log(`\n👥 Tutors (${tutors.length} total):`);
  tutors.forEach((t, i) => {
    const img = t.image ? t.image : "(none → fallback)";
    const rate = t.tutorProfile?.hourlyRate ?? 0;
    const rating = t.tutorProfile?.rating?.toFixed(2) ?? "0.00";
    console.log(`   ${i + 1}. ${t.name} — image: ${img} — $${rate}/hr — ★ ${rating}`);
  });

  // Home page simulation: first 4 tutors
  console.log("\n\n🏠 Home Page (first 4 tutors):");
  const homeTutors = tutors.slice(0, 4);
  homeTutors.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.name} (${t.email})`);
    console.log(`      image: ${t.image || "NOT SET"}`);
  });

  // Tutors with image field set
  const withImage = tutors.filter(t => t.image && t.image.trim().length > 0);
  console.log(`\n🖼️  Tutors with image set: ${withImage.length}/${tutors.length}`);
  if (withImage.length > 0) {
    withImage.forEach(t => console.log(`   ${t.name}: ${t.image}`));
  }

  // Category tutor counts
  console.log("\n\n📂 Category Tutor Counts:");
  const categories = await prisma.category.findMany({
    include: {
      subjects: {
        include: {
          tutorSubjects: {
            include: { tutor: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  categories.forEach(cat => {
    const tutorIds = new Set<string>();
    cat.subjects.forEach(subj => {
      subj.tutorSubjects.forEach(ts => {
        if (ts.tutor?.userId) {
          tutorIds.add(ts.tutor.userId);
        }
      });
    });
    console.log(`   ${cat.name}: ${tutorIds.size} tutors`);
  });

  console.log("\n✅ Done.");
}

runDiagnosis().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
