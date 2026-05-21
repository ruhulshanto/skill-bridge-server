import fs from 'fs';

const seedFile = 'd:\\Shanto\\Projects\\skillBridge\\SkillBridge-server\\prisma\\seed.ts';
let content = fs.readFileSync(seedFile, 'utf8');

const generatedTutors = fs.readFileSync('d:\\Shanto\\Projects\\skillBridge\\SkillBridge-server\\scratch\\generated_tutors.ts', 'utf8');

// Replace the old tutorsData
const startStr = '// ============ 30 TUTORS WITH PROFILE IMAGES ============';
const endStr = 'const adminData = [';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + 
            '// ============ 32 TUTORS WITH LOCAL PROFILE IMAGES ============\n' + 
            generatedTutors + '\n\n' + 
            content.substring(endIndex);
}

// Add explicit deletion at the top of main()
const mainStr = 'async function main() {\n  try {\n';
const deleteStr = `    // EXPLICIT CLEANUP (Step 1)\n    console.log("🧹 Wiping existing tutor data...");\n    await prisma.user.deleteMany({ where: { role: "TUTOR" } });\n    console.log("✓ Cleanup complete.\\n");\n`;
if (!content.includes('EXPLICIT CLEANUP')) {
    content = content.replace(mainStr, mainStr + deleteStr);
}

// Change getImage(t.imageSeed) to t.imageLocal
content = content.replace(/image:\s*getImage\(t\.imageSeed\),/g, 'image: t.imageLocal,');

// Replace studentData and the signup loops to match the previous fixes
const oldStudentData = `const studentData = [
  {
    name: "Demo Student",
    email: "student@example.com",
    password: "Student@123456",
    bio: "I'm here to learn new skills!",
  }
];`;

const newStudentData = `const studentData = [
  {
    name: "Demo Student",
    email: "student@example.com",
    password: "Student@123456",
    bio: "I'm here to learn new skills!",
  },
  {
    name: "Alice Johnson",
    email: "alice@example.com",
    password: "Student@123456",
    bio: "Lifelong learner looking to switch careers.",
  },
  {
    name: "Bob Smith",
    email: "bob@example.com",
    password: "Student@123456",
    bio: "Trying to improve my coding skills.",
  },
  {
    name: "Charlie Brown",
    email: "charlie@example.com",
    password: "Student@123456",
    bio: "Passionate about tech.",
  }
];`;

content = content.replace(oldStudentData, newStudentData);

// Admin signup active
content = content.replace(/role: "ADMIN",\s*\},/g, 'role: "ADMIN",\n        status: "ACTIVE",\n      },');

// Tutor signup active
content = content.replace(/role: "TUTOR",\s*\},/g, 'role: "TUTOR",\n            status: "ACTIVE",\n          },');

// Student loop replacement
const oldStudentLoop = `    // Seed Demo Student
    console.log("\\n👤 Seeding demo student...");
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
    console.log(\`  ✓ \${studentData[0].name}\`);`;

const newStudentLoop = `    // Seed Demo Students
    console.log("\\n👤 Seeding demo students...");
    const studentIds: string[] = [];
    for (const s of studentData) {
      let user = await prisma.user.findUnique({ where: { email: s.email } });
      if (!user) {
        const authRes = await auth.api.signUpEmail({
          body: {
            name: s.name,
            email: s.email,
            password: s.password,
            role: "STUDENT",
            status: "ACTIVE",
          },
        });
        if (authRes) {
          user = await prisma.user.update({
            where: { email: s.email },
            data: { emailVerified: true, status: "ACTIVE", bio: s.bio }
          });
        }
      }
      if (user) studentIds.push(user.id);
      console.log(\`  ✓ \${s.name}\`);
    }`;

content = content.replace(oldStudentLoop, newStudentLoop);

// Add reviews and bookings block
const oldSummary = `    }

    // Summary`;

const newReviewsAndSummary = `    }

    // Seed Bookings and Reviews
    console.log(\`\\n📝 Seeding bookings and reviews...\`);
    const allTutors = await prisma.tutorProfile.findMany({
      include: { user: true }
    });
    
    let totalReviewsSeeded = 0;
    if (studentIds.length > 0) {
      for (const tutor of allTutors) {
        const numReviews = Math.floor(Math.random() * 24) + 2; // 2 to 25 reviews
        let sumRatings = 0;
        
        for (let i = 0; i < numReviews; i++) {
          const studentId = studentIds[(totalReviewsSeeded + i) % studentIds.length];
          const ratingOptions = [3.5, 4.0, 4.5, 5.0];
          const rating = ratingOptions[Math.floor(Math.random() * ratingOptions.length)];
          sumRatings += rating;
          
          const booking = await prisma.booking.create({
            data: {
              studentId,
              tutorId: tutor.id,
              date: new Date(),
              startTime: "10:00",
              endTime: "11:00",
              status: "COMPLETED",
              totalAmount: tutor.hourlyRate,
            }
          });
          
          await prisma.review.create({
            data: {
              bookingId: booking.id,
              studentId,
              tutorId: tutor.id,
              rating,
              comment: ["Great session!", "Very helpful.", "Explained things clearly.", "Awesome tutor!", "Highly recommended!"][Math.floor(Math.random() * 5)],
            }
          });
        }
        
        const avgRating = sumRatings / numReviews;
        
        await prisma.tutorProfile.update({
          where: { id: tutor.id },
          data: {
            rating: avgRating,
            totalReviews: numReviews
          }
        });
        totalReviewsSeeded += numReviews;
      }
      console.log(\`  ✓ Seeded \${totalReviewsSeeded} reviews across \${allTutors.length} tutors.\`);
    }

    // Summary`;

content = content.replace(oldSummary, newReviewsAndSummary);

fs.writeFileSync(seedFile, content);
console.log('Successfully patched seed.ts');
