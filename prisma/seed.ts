import "dotenv/config";
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs';

const connectionString = `${process.env.DATABASE_URL}`
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Starting to create test data...');

  try {
    // Create Subjects
    console.log('📚 Creating subjects...');
    const subjects = await Promise.all([
      prisma.subject.upsert({
        where: { slug: 'programming' },
        update: {},
        create: { name: 'Programming', slug: 'programming' }
      }),
      prisma.subject.upsert({
        where: { slug: 'mathematics' },
        update: {},
        create: { name: 'Mathematics', slug: 'mathematics' }
      }),
      prisma.subject.upsert({
        where: { slug: 'languages' },
        update: {},
        create: { name: 'Languages', slug: 'languages' }
      }),
      prisma.subject.upsert({
        where: { slug: 'science' },
        update: {},
        create: { name: 'Science', slug: 'science' }
      }),
    ]);

    // Create Admin User
    console.log('👑 Creating admin user...');
    const admin = await prisma.user.upsert({
      where: { email: "admin@skillbridge.com" },
      update: { 
        role: "ADMIN", 
        status: "ACTIVE",
        image: "https://i.ibb.co.com/Sw9Ff6St/shanto-Img.jpg"
      },
      create: {
        name: "Admin User",
        email: "admin@skillbridge.com",
        emailVerified: true,
        role: "ADMIN",
        status: "ACTIVE",
        phone: "+1234567890",
        image: "https://i.ibb.co.com/Sw9Ff6St/shanto-Img.jpg"
      },
    });

    // Create Test Tutor
    console.log('👨‍🏫 Creating test tutor...');
    const testTutor = await prisma.user.upsert({
      where: { email: "tutor@test.com" },
      update: { 
        role: "TUTOR", 
        status: "ACTIVE",
        image: "https://picsum.photos/seed/maintutor/200/200.jpg"
      },
      create: {
        name: "Test Tutor",
        email: "tutor@test.com",
        emailVerified: true,
        role: "TUTOR",
        status: "ACTIVE",
        phone: "+1234567891",
        image: "https://picsum.photos/seed/maintutor/200/200.jpg"
      },
    });

    // Create Tutor Profile for Test Tutor
    console.log('📋 Creating tutor profile...');
    const tutorProfile = await prisma.tutorProfile.upsert({
      where: { userId: testTutor.id },
      update: {
        bio: 'Experienced software developer with 5+ years of teaching experience. Specialized in web development and programming languages.',
        hourlyRate: 5000, // $50 in cents
        experience: 5,
        education: 'Bachelor of Science in Computer Science',
        rating: 4.8,
        totalReviews: 12,
        isVerified: true
      },
      create: {
        userId: testTutor.id,
        bio: 'Experienced software developer with 5+ years of teaching experience. Specialized in web development and programming languages.',
        hourlyRate: 5000, // $50 in cents
        experience: 5,
        education: 'Bachelor of Science in Computer Science',
        rating: 4.8,
        totalReviews: 12,
        isVerified: true
      }
    });

    // Add subjects to tutor profile
    await prisma.tutorSubject.deleteMany({ where: { tutorId: tutorProfile.id } });
    await prisma.tutorSubject.createMany({
      data: [
        { tutorId: tutorProfile.id, subjectId: subjects[0].id }, // Programming
        { tutorId: tutorProfile.id, subjectId: subjects[1].id }, // Mathematics
      ]
    });

    // Create Test Student
    console.log('👨‍🎓 Creating test student...');
    const testStudent = await prisma.user.upsert({
      where: { email: "student@test.com" },
      update: { 
        role: "STUDENT", 
        status: "ACTIVE",
        image: "https://picsum.photos/seed/student/200/200.jpg"
      },
      create: {
        name: "Test Student",
        email: "student@test.com",
        emailVerified: true,
        role: "STUDENT",
        status: "ACTIVE",
        phone: "+1234567892",
        image: "https://picsum.photos/seed/student/200/200.jpg"
      },
    });

    // Create Additional Tutors with unique images
    console.log('👨‍🏫 Creating additional tutors...');
    const tutorImages = [
      "https://picsum.photos/seed/tutor1/200/200.jpg",
      "https://picsum.photos/seed/tutor2/200/200.jpg",
      "https://picsum.photos/seed/tutor3/200/200.jpg",
      "https://picsum.photos/seed/tutor4/200/200.jpg",
      "https://picsum.photos/seed/tutor5/200/200.jpg",
      "https://picsum.photos/seed/tutor6/200/200.jpg"
    ];

    const tutorNames = [
      "Dr. Sarah Johnson",
      "Prof. Michael Chen", 
      "Ms. Emily Rodriguez",
      "Mr. David Kim",
      "Dr. Jessica Williams"
    ];

    const tutorBios = [
      "PhD in Computer Science with 10+ years teaching programming and web development",
      "Mathematics expert specializing in calculus, linear algebra, and discrete mathematics",
      "Language specialist with expertise in English, Spanish, and French literature",
      "Science educator focusing on physics, chemistry, and environmental science",
      "Business and technology consultant with real-world industry experience"
    ];

    for (let i = 1; i <= 5; i++) {
      const tutor = await prisma.user.upsert({
        where: { email: `tutor${i}@test.com` },
        update: { 
          role: "TUTOR", 
          status: "ACTIVE",
          image: tutorImages[i]
        },
        create: {
          name: tutorNames[i - 1],
          email: `tutor${i}@test.com`,
          emailVerified: true,
          role: "TUTOR",
          status: "ACTIVE",
          phone: `+123456789${i + 2}`,
          image: tutorImages[i]
        },
      });

      const profile = await prisma.tutorProfile.upsert({
        where: { userId: tutor.id },
        update: {
          bio: tutorBios[i - 1],
          hourlyRate: 3000 + (i * 1000), // $30-$70 in cents
          experience: 2 + i,
          education: `Master's Degree in ${subjects[i % 4].name}`,
          rating: 4.0 + (i * 0.2),
          totalReviews: i * 5,
          isVerified: i % 2 === 0
        },
        create: {
          userId: tutor.id,
          bio: tutorBios[i - 1],
          hourlyRate: 3000 + (i * 1000), // $30-$70 in cents
          experience: 2 + i,
          education: `Master's Degree in ${subjects[i % 4].name}`,
          rating: 4.0 + (i * 0.2),
          totalReviews: i * 5,
          isVerified: i % 2 === 0
        }
      });

      // Add subjects
      await prisma.tutorSubject.deleteMany({ where: { tutorId: profile.id } });
      await prisma.tutorSubject.createMany({
        data: subjects.slice(0, 2).map(subject => ({
          tutorId: profile.id,
          subjectId: subject.id
        }))
      });
    }

    console.log('✅ Test data created successfully!');
    console.log('\n📋 Created Accounts:');
    console.log('👑 Admin: admin@skillbridge.com (with profile image)');
    console.log('👨‍🏫 Test Tutor: tutor@test.com (with profile image)');
    console.log('👨‍🎓 Test Student: student@test.com (with profile image)');
    console.log('👨‍🏫 Additional Tutors: tutor1@test.com through tutor5@test.com');
    console.log('\n🖼️ Profile Images Added:');
    console.log('👑 Admin: https://i.ibb.co.com/Sw9Ff6St/shanto-Img.jpg');
    console.log('👨‍🏫 Tutor: https://i.ibb.co.com/6P6fJcQr/tutor-avatar.jpg');
    console.log('👨‍🎓 Student: https://i.ibb.co.com/8gX7mY2f/student-avatar.jpg');

  } catch (error) {
    console.error('❌ Error creating test data:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });