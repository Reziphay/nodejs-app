import prisma from './prisma';

const BRAND_CATEGORIES = [
  'Food & Beverage',
  'Beauty & Wellness',
  'Fitness & Sports',
  'Fashion & Apparel',
  'Technology & Electronics',
  'Home & Furniture',
  'Health & Pharmacy',
  'Education & Training',
  'Entertainment & Media',
  'Travel & Hospitality',
];

export async function seedBrandCategories(): Promise<void> {
  console.log('Seeding brand categories...');

  for (const name of BRAND_CATEGORIES) {
    await prisma.brandCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log(`Seeded ${BRAND_CATEGORIES.length} brand categories.`);
}

// Allow running directly: npx ts-node src/lib/seed-categories.ts
if (require.main === module) {
  seedBrandCategories()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
