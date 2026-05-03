
import prisma from '../lib/prisma';

async function main() {
  try {
    const applications = await prisma.tutorApplication.findMany({
      include: { user: true }
    });
    console.log('Total Applications:', applications.length);
    applications.forEach(app => {
      console.log(`ID: ${app.id}, User: ${app.user?.name || 'Unknown'}, Status: ${app.status}`);
    });
  } catch (error) {
    console.error('Error checking apps:', error);
  }
}

main()
  .finally(async () => await prisma.$disconnect());
