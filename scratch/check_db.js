const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({});

async function main() {
  const profiles = await prisma.tutorProfile.findMany({
    select: { rating: true, totalReviews: true, user: { select: { name: true } } },
    orderBy: { rating: 'desc' }
  });
  console.table(profiles.map(p => ({
    name: p.user.name,
    rating: p.rating,
    reviews: p.totalReviews
  })));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
