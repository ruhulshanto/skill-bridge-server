import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ============ CATEGORIES (6) ============
const categoriesData = [
  {
    name: "Technology & CS",
    slug: "technology",
    description: "Master tech skills",
    icon: "💻",
    color: "#8B5CF6",
  },
  {
    name: "Mathematics",
    slug: "mathematics",
    description: "Learn mathematics",
    icon: "🔢",
    color: "#10B981",
  },
  {
    name: "Languages",
    slug: "languages",
    description: "Learn languages",
    icon: "🌍",
    color: "#3B82F6",
  },
  {
    name: "Science",
    slug: "science",
    description: "Explore science",
    icon: "🔬",
    color: "#EC4899",
  },
  {
    name: "Arts",
    slug: "arts",
    description: "Develop creative skills",
    icon: "🎨",
    color: "#F59E0B",
  },
  {
    name: "Music",
    slug: "music",
    description: "Learn music",
    icon: "🎵",
    color: "#6366F1",
  },
];

// ============ SUBJECTS (21) ============
const subjectsData = [
  {
    name: "Computer Science",
    slug: "computer-science",
    description: "CS fundamentals",
    categorySlug: "technology",
  },
  {
    name: "Web Development",
    slug: "web-development",
    description: "Web dev",
    categorySlug: "technology",
  },
  {
    name: "Data Science",
    slug: "data-science",
    description: "Data & ML",
    categorySlug: "technology",
  },
  {
    name: "Mathematics",
    slug: "mathematics",
    description: "General math",
    categorySlug: "mathematics",
  },
  {
    name: "Algebra",
    slug: "algebra",
    description: "Algebra",
    categorySlug: "mathematics",
  },
  {
    name: "Calculus",
    slug: "calculus",
    description: "Calculus",
    categorySlug: "mathematics",
  },
  {
    name: "Statistics",
    slug: "statistics",
    description: "Statistics",
    categorySlug: "mathematics",
  },
  {
    name: "English",
    slug: "english",
    description: "English",
    categorySlug: "languages",
  },
  {
    name: "Spanish",
    slug: "spanish",
    description: "Spanish",
    categorySlug: "languages",
  },
  {
    name: "French",
    slug: "french",
    description: "French",
    categorySlug: "languages",
  },
  {
    name: "Mandarin",
    slug: "mandarin",
    description: "Mandarin",
    categorySlug: "languages",
  },
  {
    name: "Physics",
    slug: "physics",
    description: "Physics",
    categorySlug: "science",
  },
  {
    name: "Chemistry",
    slug: "chemistry",
    description: "Chemistry",
    categorySlug: "science",
  },
  {
    name: "Biology",
    slug: "biology",
    description: "Biology",
    categorySlug: "science",
  },
  {
    name: "Drawing",
    slug: "drawing",
    description: "Drawing",
    categorySlug: "arts",
  },
  {
    name: "Painting",
    slug: "painting",
    description: "Painting",
    categorySlug: "arts",
  },
  {
    name: "Graphic Design",
    slug: "graphic-design",
    description: "Graphic design",
    categorySlug: "arts",
  },
  { name: "Piano", slug: "piano", description: "Piano", categorySlug: "music" },
  {
    name: "Guitar",
    slug: "guitar",
    description: "Guitar",
    categorySlug: "music",
  },
  {
    name: "Music Theory",
    slug: "music-theory",
    description: "Theory",
    categorySlug: "music",
  },
  {
    name: "Vocal",
    slug: "vocal",
    description: "Vocal training",
    categorySlug: "music",
  },
];

// ============ 30 TUTORS WITH PROFILE IMAGES ============
const tutorsData = [
  // TECH (5)
  {
    name: "David Chen",
    email: "david.chen@skillbridge.local",
    password: "David@123456",
    bio: "Senior Software Engineer at Google. I make coding simple and fun.",
    hourlyRate: 75,
    experience: 5,
    education: "B.S. CS, Stanford, 2019",
    subjects: ["computer-science", "web-development"],
    imageSeed: "davidchen",
    availability: [
      { dayOfWeek: 2, startTime: "14:00", endTime: "20:00" },
      { dayOfWeek: 4, startTime: "14:00", endTime: "20:00" },
    ],
  },
  {
    name: "Alex Rivera",
    email: "alex.rivera@skillbridge.local",
    password: "Alex@123456",
    bio: "Full-stack developer. 100+ students landed tech jobs.",
    hourlyRate: 0,
    experience: 3,
    education: "B.Tech CS, MIT, 2021",
    subjects: ["data-science"],
    imageSeed: "alexrivera",
    availability: [
      { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 3, startTime: "09:00", endTime: "17:00" },
    ],
  },
  {
    name: "Rachel Kim",
    email: "rachel.kim@skillbridge.local",
    password: "Rachel@123456",
    bio: "Ex-FAANG engineer. Algorithms and system design expert.",
    hourlyRate: 85,
    experience: 8,
    education: "M.S. CS, UC Berkeley, 2016",
    subjects: ["computer-science", "data-science"],
    imageSeed: "rachelkim",
    availability: [{ dayOfWeek: 2, startTime: "10:00", endTime: "18:00" }],
  },
  {
    name: "Jason Wu",
    email: "jason.wu@skillbridge.local",
    password: "Jason@123456",
    bio: "React/Next.js specialist. Modern frontend architecture.",
    hourlyRate: 60,
    experience: 4,
    education: "B.S. SE, UW, 2020",
    subjects: ["web-development"],
    imageSeed: "jasonwu",
    availability: [{ dayOfWeek: 1, startTime: "15:00", endTime: "21:00" }],
  },
  {
    name: "Michelle Park",
    email: "michelle.park@skillbridge.local",
    password: "Michelle@123456",
    bio: "DevOps engineer. Cloud, Docker, Kubernetes, AWS.",
    hourlyRate: 70,
    experience: 6,
    education: "B.Eng. CE, Georgia Tech, 2018",
    subjects: ["data-science"],
    imageSeed: "michellepark",
    availability: [{ dayOfWeek: 4, startTime: "09:00", endTime: "15:00" }],
  },
  // MATH (4)
  {
    name: "Sarah Johnson",
    email: "sarah.johnson@skillbridge.local",
    password: "Sarah@123456",
    bio: "Passionate math educator. Master's in Applied Math.",
    hourlyRate: 55,
    experience: 7,
    education: "M.S. Applied Math, Columbia, 2018",
    subjects: ["mathematics", "algebra"],
    imageSeed: "sarahjohnson",
    availability: [
      { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 3, startTime: "09:00", endTime: "17:00" },
    ],
  },
  {
    name: "Dr. Robert Kim",
    email: "robert.kim@skillbridge.local",
    password: "Robert@123456",
    bio: "Ex-professor. 15 years teaching calculus & advanced math.",
    hourlyRate: 65,
    experience: 15,
    education: "Ph.D. Mathematics, Harvard, 2010",
    subjects: ["calculus", "statistics"],
    imageSeed: "robertkim",
    availability: [{ dayOfWeek: 2, startTime: "10:00", endTime: "18:00" }],
  },
  {
    name: "Emily Zhang",
    email: "emily.zhang@skillbridge.local",
    password: "EmilyZ@123456",
    bio: "SAT/ACT prep specialist. 200+ students improved scores.",
    hourlyRate: 45,
    experience: 5,
    education: "B.A. Mathematics, UCLA, 2019",
    subjects: ["algebra", "calculus"],
    imageSeed: "emilyzhang",
    availability: [{ dayOfWeek: 5, startTime: "14:00", endTime: "20:00" }],
  },
  {
    name: "Mohammed Al-Fayed",
    email: "mohammed.alfayed@skillbridge.local",
    password: "Mohammed@123456",
    bio: "Statistics expert. Real-world data analysis.",
    hourlyRate: 60,
    experience: 9,
    education: "M.Sc. Statistics, Chicago, 2015",
    subjects: ["statistics", "mathematics"],
    imageSeed: "mohammedalfayed",
    availability: [{ dayOfWeek: 3, startTime: "10:00", endTime: "18:00" }],
  },
  // LANGUAGES (4)
  {
    name: "Emily Davis",
    email: "emily.davis@skillbridge.local",
    password: "Emily@123456",
    bio: "Published author. Master English grammar and writing.",
    hourlyRate: 45,
    experience: 8,
    education: "M.A. English Lit, Oxford, 2017",
    subjects: ["english"],
    imageSeed: "emilydavis",
    availability: [
      { dayOfWeek: 1, startTime: "10:00", endTime: "18:00" },
      { dayOfWeek: 4, startTime: "09:00", endTime: "17:00" },
    ],
  },
  {
    name: "Carlos Mendez",
    email: "carlos.mendez@skillbridge.local",
    password: "Carlos@123456",
    bio: "Native Spanish speaker. 10+ years teaching. Fluent in 4 languages.",
    hourlyRate: 0,
    experience: 10,
    education: "B.A. Spanish, Barcelona, 2014",
    subjects: ["spanish", "french"],
    imageSeed: "carlosmendez",
    availability: [{ dayOfWeek: 2, startTime: "14:00", endTime: "20:00" }],
  },
  {
    name: "Li Wei",
    email: "li.wei@skillbridge.local",
    password: "LiWei@123456",
    bio: "Native Mandarin. HSK level 10. Practical conversation focus.",
    hourlyRate: 50,
    experience: 6,
    education: "B.A. Linguistics, Beijing, 2018",
    subjects: ["mandarin"],
    imageSeed: "liwei",
    availability: [{ dayOfWeek: 3, startTime: "09:00", endTime: "17:00" }],
  },
  {
    name: "Sophie Martin",
    email: "sophie.martin@skillbridge.local",
    password: "Sophie@123456",
    bio: "Paris native. Conversational French, exam prep, business French.",
    hourlyRate: 55,
    experience: 12,
    education: "M.A. French Lit, Sorbonne, 2012",
    subjects: ["french"],
    imageSeed: "sophiemartin",
    availability: [{ dayOfWeek: 1, startTime: "13:00", endTime: "19:00" }],
  },
  // SCIENCE (4)
  {
    name: "Michael Wilson",
    email: "michael.wilson@skillbridge.local",
    password: "Michael@123456",
    bio: "Ph.D. Physics candidate at MIT. Making physics accessible.",
    hourlyRate: 65,
    experience: 4,
    education: "Ph.D. Physics (Candidate), MIT",
    subjects: ["physics", "chemistry"],
    imageSeed: "michaelwilson",
    availability: [
      { dayOfWeek: 2, startTime: "15:00", endTime: "21:00" },
      { dayOfWeek: 5, startTime: "15:00", endTime: "21:00" },
    ],
  },
  {
    name: "Dr. Amanda Foster",
    email: "amanda.foster@skillbridge.local",
    password: "Amanda@123456",
    bio: "Research biologist. Real-world examples and hands-on learning.",
    hourlyRate: 60,
    experience: 12,
    education: "Ph.D. Biology, Stanford, 2012",
    subjects: ["biology", "chemistry"],
    imageSeed: "amandafoster",
    availability: [{ dayOfWeek: 1, startTime: "10:00", endTime: "18:00" }],
  },
  {
    name: "Dr. James Liu",
    email: "james.liu@skillbridge.local",
    password: "JamesL@123456",
    bio: "Chemist in pharmaceuticals. Fundamentals to advanced organic.",
    hourlyRate: 58,
    experience: 10,
    education: "Ph.D. Organic Chem, Harvard, 2014",
    subjects: ["chemistry", "physics"],
    imageSeed: "jamesliu",
    availability: [{ dayOfWeek: 5, startTime: "09:00", endTime: "15:00" }],
  },
  {
    name: "Nina Patel",
    email: "nina.patel@skillbridge.local",
    password: "Nina@123456",
    bio: "Environmental science. Ecosystems, genetics, cellular biology.",
    hourlyRate: 50,
    experience: 6,
    education: "M.S. Env Science, Yale, 2018",
    subjects: ["biology"],
    imageSeed: "ninapatel",
    availability: [{ dayOfWeek: 3, startTime: "14:00", endTime: "20:00" }],
  },
  // ARTS (4)
  {
    name: "James Thompson",
    email: "james.thompson@skillbridge.local",
    password: "James@123456",
    bio: "Professional artist 10+ years. Drawing, painting, visual storytelling.",
    hourlyRate: 60,
    experience: 10,
    education: "B.F.A. Fine Arts, RISD, 2014",
    subjects: ["drawing", "painting"],
    imageSeed: "jamesthomspson",
    availability: [
      { dayOfWeek: 2, startTime: "16:00", endTime: "20:00" },
      { dayOfWeek: 4, startTime: "16:00", endTime: "20:00" },
    ],
  },
  {
    name: "Sophia Chang",
    email: "sophia.chang@skillbridge.local",
    password: "Sophia@123456",
    bio: "Digital artist. Fortune 500 experience. Practical design skills.",
    hourlyRate: 55,
    experience: 6,
    education: "B.F.A. Digital Arts, Parsons, 2018",
    subjects: ["graphic-design"],
    imageSeed: "sophiachang",
    availability: [{ dayOfWeek: 3, startTime: "14:00", endTime: "20:00" }],
  },
  {
    name: "Isabella Martinez",
    email: "isabella.martinez@skillbridge.local",
    password: "Isabella@123456",
    bio: "Oil painter. Classical techniques, color theory.",
    hourlyRate: 50,
    experience: 8,
    education: "M.F.A. Painting, SAIC, 2016",
    subjects: ["painting"],
    imageSeed: "isabellamartinez",
    availability: [{ dayOfWeek: 1, startTime: "11:00", endTime: "17:00" }],
  },
  {
    name: "David Park",
    email: "david.park@skillbridge.local",
    password: "DavidP@123456",
    bio: "UI/UX designer. Digital drawing, character design, concept art.",
    hourlyRate: 52,
    experience: 5,
    education: "B.F.A. Illustration, ArtCenter, 2019",
    subjects: ["drawing", "graphic-design"],
    imageSeed: "davidparkart",
    availability: [{ dayOfWeek: 6, startTime: "13:00", endTime: "19:00" }],
  },
  // MUSIC (4)
  {
    name: "Marcus Johnson",
    email: "marcus.johnson@skillbridge.local",
    password: "Marcus@123456",
    bio: "Jazz pianist/composer. 20 years. Piano, theory, improvisation.",
    hourlyRate: 65,
    experience: 20,
    education: "B.M. Jazz Studies, Juilliard, 2006",
    subjects: ["piano", "music-theory"],
    imageSeed: "marcusjohnson",
    availability: [{ dayOfWeek: 1, startTime: "13:00", endTime: "19:00" }],
  },
  {
    name: "Elena Rodriguez",
    email: "elena.rodriguez@skillbridge.local",
    password: "Elena@123456",
    bio: "Classical guitarist/vocalist. Europe performances.",
    hourlyRate: 0,
    experience: 8,
    education: "M.M. Guitar, Royal Academy, 2016",
    subjects: ["guitar", "vocal"],
    imageSeed: "elenarodriguez",
    availability: [
      { dayOfWeek: 2, startTime: "10:00", endTime: "16:00" },
      { dayOfWeek: 5, startTime: "10:00", endTime: "16:00" },
    ],
  },
  {
    name: "Yuki Tanaka",
    email: "yuki.tanaka@skillbridge.local",
    password: "Yuki@123456",
    bio: "Tokyo Symphony violinist. All ages and skill levels.",
    hourlyRate: 70,
    experience: 15,
    education: "Artist Diploma, Conservatoire de Paris, 2009",
    subjects: ["piano", "music-theory"],
    imageSeed: "yukitanaka",
    availability: [{ dayOfWeek: 3, startTime: "15:00", endTime: "20:00" }],
  },
  {
    name: "Chris Williams",
    email: "chris.williams@skillbridge.local",
    password: "Chris@123456",
    bio: "Drummer/producer. Rhythm, percussion, music production.",
    hourlyRate: 55,
    experience: 7,
    education: "B.A. Music Production, Berklee, 2017",
    subjects: ["music-theory"],
    imageSeed: "chriswilliams",
    availability: [{ dayOfWeek: 1, startTime: "16:00", endTime: "21:00" }],
  },
  // BONUS (6)
  {
    name: "Anna Kowalski",
    email: "anna.kowalski@skillbridge.local",
    password: "Anna@123456",
    bio: "Polyglot (5 languages). Fun conversation-based learning.",
    hourlyRate: 48,
    experience: 9,
    education: "M.A. Linguistics, Warsaw, 2015",
    subjects: ["english", "spanish"],
    imageSeed: "annakowalski",
    availability: [{ dayOfWeek: 2, startTime: "09:00", endTime: "15:00" }],
  },
  {
    name: "Tom Anderson",
    email: "tom.anderson@skillbridge.local",
    password: "Tom@123456",
    bio: "Startup CTO. Real-world projects, clean code.",
    hourlyRate: 80,
    experience: 12,
    education: "B.S. CE, Cornell, 2012",
    subjects: ["computer-science", "web-development"],
    imageSeed: "tomanderson",
    availability: [{ dayOfWeek: 3, startTime: "10:00", endTime: "16:00" }],
  },
  {
    name: "Lisa Wang",
    email: "lisa.wang@skillbridge.local",
    password: "Lisa@123456",
    bio: "Netflix data scientist. Python, ML, industry projects.",
    hourlyRate: 72,
    experience: 7,
    education: "M.S. Data Science, CMU, 2017",
    subjects: ["data-science", "statistics"],
    imageSeed: "lisawang",
    availability: [{ dayOfWeek: 1, startTime: "11:00", endTime: "17:00" }],
  },
  {
    name: "Emma Thompson",
    email: "emma.thompson@skillbridge.local",
    password: "Emma@123456",
    bio: "Published novelist. Creative writing, story craft.",
    hourlyRate: 0,
    experience: 6,
    education: "M.F.A. Creative Writing, Iowa, 2018",
    subjects: ["english"],
    imageSeed: "emmathompson",
    availability: [{ dayOfWeek: 3, startTime: "10:00", endTime: "16:00" }],
  },
  {
    name: "Priya Sharma",
    email: "priya.sharma@skillbridge.local",
    password: "Priya@123456",
    bio: "Math Olympiad coach. Competition training.",
    hourlyRate: 70,
    experience: 8,
    education: "B.Tech Math, IIT Bombay, 2016",
    subjects: ["mathematics", "calculus"],
    imageSeed: "priyasharma",
    availability: [{ dayOfWeek: 2, startTime: "08:00", endTime: "14:00" }],
  },
  {
    name: "Andrei Petrov",
    email: "andrei.petrov@skillbridge.local",
    password: "Andrei@123456",
    bio: "Algorithm specialist. Coding interviews and competitions.",
    hourlyRate: 85,
    experience: 6,
    education: "B.S. Mathematics, Moscow State, 2018",
    subjects: ["computer-science", "mathematics"],
    imageSeed: "andreipetrov",
    availability: [{ dayOfWeek: 1, startTime: "12:00", endTime: "18:00" }],
  },
];

const adminData = [
  {
    name: "Admin User",
    email: "admin@skillbridge.com",
    password: "Admin123",
    bio: "Platform administrator",
  },
];

const studentData = [
  {
    name: "Demo Student",
    email: "student@example.com",
    password: "Student@123456",
    bio: "I'm here to learn new skills!",
  }
];

function getImage(seed: string): string {
  return `https://i.pravatar.cc/300?img=${seed}`;
}

// Initialize a temporary auth instance for seeding to ensure consistent hashing
const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: { type: "string" },
      status: { type: "string" },
    }
  }
});

async function main() {
  console.log("🌱 ONE-STEP SEED: Creating everything...\n");

  try {
    // Clear ALL
    console.log("🗑️  Clearing old data...");
    await prisma.tutorSubject.deleteMany({});
    await prisma.availability.deleteMany({});
    await prisma.tutorProfile.deleteMany({});
    await prisma.review.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.subject.deleteMany({});
    await prisma.category.deleteMany({});
    console.log("  ✓ Clean slate");

    // Seed Categories
    console.log("\n📚 Seeding 6 categories...");
    const catMap = new Map<string, string>();
    for (const cat of categoriesData) {
      const c = await prisma.category.create({ data: cat });
      catMap.set(cat.slug, c.id);
      console.log(`  ✓ ${cat.name}`);
    }

    // Seed Subjects
    console.log("\n📖 Seeding 21 subjects...");
    const subjMap = new Map<string, string>();
    for (const subj of subjectsData) {
      const s = await prisma.subject.create({
        data: {
          name: subj.name,
          slug: subj.slug,
          description: subj.description,
          categoryId: catMap.get(subj.categorySlug),
        },
      });
      subjMap.set(subj.slug, s.id);
      console.log(`  ✓ ${s.name} → ${subj.categorySlug}`);
    }

    // Seed Admin
    console.log("\n👤 Seeding admin...");
    const admin = await auth.api.signUpEmail({
      body: {
        name: adminData[0].name,
        email: adminData[0].email,
        password: adminData[0].password,
        role: "ADMIN",
      },
    });
    
    if (admin) {
      await prisma.user.update({
        where: { email: adminData[0].email },
        data: { 
          emailVerified: true,
          status: "ACTIVE",
          bio: adminData[0].bio 
        }
      });
    }
    console.log(`  ✓ ${adminData[0].name}`);

    // Seed Demo Student
    console.log("\n👤 Seeding demo student...");
    const student = await auth.api.signUpEmail({
      body: {
        name: studentData[0].name,
        email: studentData[0].email,
        password: studentData[0].password,
        role: "STUDENT",
      },
    });
    
    if (student) {
      await prisma.user.update({
        where: { email: studentData[0].email },
        data: { 
          emailVerified: true,
          status: "ACTIVE",
          bio: studentData[0].bio 
        }
      });
    }
    console.log(`  ✓ ${studentData[0].name}`);

    // Seed Tutors
    console.log(
      `\n👨‍🏫 Seeding ${tutorsData.length} tutors with profile images...`,
    );
    let success = 0,
      fail = 0;
    for (const t of tutorsData) {
      if (await prisma.user.findUnique({ where: { email: t.email } })) {
        console.log(`  ⚠ ${t.name} exists`);
        fail++;
        continue;
      }
      try {
        const subjIds = t.subjects
          .map((s) => subjMap.get(s))
          .filter((id): id is string => id !== undefined);
        if (subjIds.length === 0) {
          console.log(`  ⚠ ${t.name} - no subjects`);
          fail++;
          continue;
        }
        const tutor = await auth.api.signUpEmail({
          body: {
            name: t.name,
            email: t.email,
            password: t.password,
            role: "TUTOR",
          },
        });

        if (tutor) {
          await prisma.user.update({
            where: { email: t.email },
            data: {
              emailVerified: true,
              status: "ACTIVE",
              image: getImage(t.imageSeed),
              bio: t.bio,
              tutorProfile: {
                create: {
                  bio: t.bio,
                  hourlyRate: t.hourlyRate * 100,
                  experience: t.experience,
                  education: t.education,
                  isVerified: true,
                  rating: 0,
                  totalReviews: 0,
                  subjects: { create: subjIds.map((id) => ({ subjectId: id })) },
                  availability: {
                    create: t.availability.map((a) => ({
                      dayOfWeek: a.dayOfWeek,
                      startTime: a.startTime,
                      endTime: a.endTime,
                      isAvailable: true,
                    })),
                  },
                },
              },
            },
          });
        }
        console.log(
          `  ✓ ${t.name} | ${t.subjects.join(", ")} | ${t.hourlyRate === 0 ? "FREE" : "$" + t.hourlyRate + "/hr"}`,
        );
        success++;
      } catch (error) {
        console.error(`  ✗ ${t.name}:`, error);
        fail++;
      }
    }

    // Summary
    console.log(`\n✅ Complete! ${success} tutors seeded (${fail} failed)`);
    console.log("\n📊 Category counts:");
    const cats = await prisma.category.findMany({
      include: {
        subjects: { include: { tutorSubjects: { include: { tutor: true } } } },
      },
    });
    for (const cat of cats) {
      const ids = new Set<string>();
      cat.subjects.forEach((s) =>
        s.tutorSubjects.forEach((ts) => {
          if (ts.tutor?.id) ids.add(ts.tutor.id);
        }),
      );
      console.log(`  ${cat.name}: ${ids.size} tutors`);
    }
    console.log(
      "\n🎉 All data ready. Use http://localhost:3000 for API calls.",
    );
  } catch (err) {
    console.error("❌ Error:", err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
