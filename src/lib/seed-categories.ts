import prisma from './prisma';

const BRAND_CATEGORY_KEYS = [
  'food_beverage',
  'beauty_wellness',
  'fitness_sports',
  'fashion_apparel',
  'technology_electronics',
  'home_furniture',
  'health_pharmacy',
  'education_training',
  'entertainment_media',
  'travel_hospitality',
];

const SERVICE_CATEGORY_KEYS = [
  'haircut_styling',
  'massage_therapy',
  'personal_training',
  'nail_care',
  'facial_treatment',
  'dental_care',
  'consulting',
  'photo_session',
];

export async function seedBrandCategories(): Promise<void> {
  console.log('Seeding brand categories...');
  for (const key of BRAND_CATEGORY_KEYS) {
    await prisma.brandCategory.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
  console.log(`Seeded ${BRAND_CATEGORY_KEYS.length} brand categories.`);
}

export async function seedServiceCategories(): Promise<void> {
  console.log('Seeding service categories...');
  for (const key of SERVICE_CATEGORY_KEYS) {
    await prisma.serviceCategory.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
  console.log(`Seeded ${SERVICE_CATEGORY_KEYS.length} service categories.`);
}

if (require.main === module) {
  Promise.all([seedBrandCategories(), seedServiceCategories()])
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
