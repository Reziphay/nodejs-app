import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import prisma from './prisma';
import { hashPassword } from '../utils/hash';
import { seedBrandCategories, seedServiceCategories } from './seed-categories';

// Resolve STORAGE_DIR relative to this file's location (nodejs-app/src/lib → nodejs-app/)
// so the seed always writes to the same place regardless of where `ts-node` is called from.
const rawStorageDir = process.env['STORAGE_DIR'] ?? 'storage';
const SEED_STORAGE_DIR = path.isAbsolute(rawStorageDir)
  ? rawStorageDir
  : path.resolve(__dirname, '../..', rawStorageDir);

async function ensureSeedUserDir(userId: string): Promise<void> {
  await fs.mkdir(path.join(SEED_STORAGE_DIR, 'users', userId), { recursive: true });
}

async function deleteSeedUserDir(userId: string): Promise<void> {
  await fs.rm(path.join(SEED_STORAGE_DIR, 'users', userId), { recursive: true, force: true });
}

function buildSeedStoragePath(userId: string): string {
  return path.join(SEED_STORAGE_DIR, 'users', userId, `${crypto.randomUUID()}.webp`);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchDef {
  name: string;
  address1: string;
  phone: string;
  email: string;
}

interface ServiceDef {
  title: string;
  description: string;
  category_key: string;
  price?: number;
  price_type: 'FIXED' | 'STARTING_FROM' | 'FREE';
  duration: number;
}

interface UserSeedDef {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  brand_name: string;
  brand_description: string;
  brand_category_keys: string[];
  image_query: string;
  branches: BranchDef[];
  services: ServiceDef[];
  direct_services: ServiceDef[];
}

type SeededMarketplaceOwner = {
  userId: string;
  brandId: string;
  serviceIds: string[];
};

function deterministicNumber(seed: string, min: number, max: number): number {
  const digest = crypto.createHash('sha256').update(seed).digest('hex');
  const value = parseInt(digest.slice(0, 8), 16);
  return min + (value % (max - min + 1));
}

function deterministicOrder<T>(items: T[], seed: string, getKey: (item: T) => string): T[] {
  return [...items].sort(
    (a, b) =>
      deterministicNumber(`${seed}:${getKey(a)}`, 0, Number.MAX_SAFE_INTEGER - 1) -
      deterministicNumber(`${seed}:${getKey(b)}`, 0, Number.MAX_SAFE_INTEGER - 1),
  );
}

function buildRatingValues(brandId: string, count: number): number[] {
  const targetTenths = deterministicNumber(`${brandId}:rating-target`, 39, 49);
  const targetTotal = Math.round((targetTenths / 10) * count);
  const baseline = 4 * count;
  const values = Array.from({ length: count }, () => 4);
  const upgradeOrder = deterministicOrder(
    Array.from({ length: count }, (_, index) => index),
    `${brandId}:rating-upgrade-order`,
    (index) => String(index),
  );
  const downgradeOrder = deterministicOrder(
    Array.from({ length: count }, (_, index) => index),
    `${brandId}:rating-downgrade-order`,
    (index) => String(index),
  );

  if (targetTotal > baseline) {
    const upgrades = Math.min(targetTotal - baseline, count);
    for (const index of upgradeOrder.slice(0, upgrades)) {
      values[index] = 5;
    }
  }

  if (targetTotal < baseline) {
    const downgrades = Math.min(baseline - targetTotal, count);
    for (const index of downgradeOrder.slice(0, downgrades)) {
      values[index] = 3;
    }
  }

  return values;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const BAKU_BRANCHES: BranchDef[] = [
  {
    name: 'Nasimi — İçərişəhər',
    address1: 'Hüseyn Cavid pr. 5, Nasimi r.',
    phone: '+99412 555 0101',
    email: 'nasimi@brand.az',
  },
  {
    name: 'Sabail — Şəhər Mərkəzi',
    address1: 'İstiqlaliyyət küç. 12, Sabail r.',
    phone: '+99412 555 0102',
    email: 'sabail@brand.az',
  },
  {
    name: 'Yasamal — Atatürk Prospekti',
    address1: 'Atatürk pr. 44, Yasamal r.',
    phone: '+99412 555 0103',
    email: 'yasamal@brand.az',
  },
  {
    name: 'Nizami — Köhnə Şəhər',
    address1: 'Nizami küç. 88, Nizami r.',
    phone: '+99412 555 0104',
    email: 'nizami@brand.az',
  },
  {
    name: 'Binəqədi — Şimali Baku',
    address1: 'Binaqadi şossesi 17, Binaqadi r.',
    phone: '+99412 555 0105',
    email: 'binaqadi@brand.az',
  },
  {
    name: 'Suraxanı — Sənaye Rayonu',
    address1: 'Surakhani küç. 3, Surakhani r.',
    phone: '+99412 555 0106',
    email: 'surakhani@brand.az',
  },
  {
    name: 'Sabunçu — Maştağa Yolu',
    address1: 'Maştağa küç. 22, Sabunchu r.',
    phone: '+99412 555 0107',
    email: 'sabunchu@brand.az',
  },
  {
    name: 'Xəzər — Buzovna Sahili',
    address1: 'Buzovna şossesi 9, Xəzər r.',
    phone: '+99412 555 0108',
    email: 'xazar@brand.az',
  },
];

function bakuBranches(domain: string): BranchDef[] {
  return BAKU_BRANCHES.map((b) => ({
    ...b,
    email: b.email.replace('brand.az', domain),
  }));
}

const USER_PROFILES = [
  ['Aylin', 'Karimova'],
  ['Murad', 'Aliyev'],
  ['Leyla', 'Mammadova'],
  ['Orkhan', 'Hasanov'],
  ['Nigar', 'Huseynova'],
  ['Rauf', 'Mammadli'],
  ['Zahra', 'Ismayilova'],
  ['Tural', 'Guliyev'],
  ['Fidan', 'Rahimli'],
  ['Kamran', 'Abdullayev'],
  ['Sabina', 'Rustamova'],
  ['Emin', 'Jafarov'],
  ['Lala', 'Asadova'],
  ['Farid', 'Valiyev'],
  ['Aysel', 'Nabiyeva'],
  ['Samir', 'Hajiyev'],
  ['Gunel', 'Bayramova'],
  ['Elvin', 'Mustafayev'],
  ['Narmin', 'Taghiyeva'],
  ['Rashad', 'Suleymanov'],
] as const;

const BRAND_BLUEPRINTS = [
  { name: 'Luna Beauty Studio', categoryKeys: ['beauty_wellness', 'fashion_apparel'], query: 'beauty,salon,spa', domain: 'luna.az', focus: 'luxury beauty, hair design and skin rituals' },
  { name: 'Nova Wellness Club', categoryKeys: ['fitness_sports', 'health_pharmacy'], query: 'fitness,gym,workout', domain: 'nova.az', focus: 'personal training, recovery and healthy routines' },
  { name: 'DentaCare House', categoryKeys: ['health_pharmacy'], query: 'dental,clinic,health', domain: 'dentacare.az', focus: 'digital dentistry and calm patient care' },
  { name: 'MentorLab Consulting', categoryKeys: ['education_training'], query: 'business,office,consulting', domain: 'mentorlab.az', focus: 'career, leadership and business advisory' },
  { name: 'Aura Nail & Skin Bar', categoryKeys: ['beauty_wellness'], query: 'nails,skincare,spa', domain: 'aura.az', focus: 'nail artistry, skincare and spa maintenance' },
  { name: 'Pulse Performance Gym', categoryKeys: ['fitness_sports'], query: 'gym,trainer,athlete', domain: 'pulse.az', focus: 'strength, conditioning and athletic development' },
  { name: 'Bright Smile Clinic', categoryKeys: ['health_pharmacy', 'beauty_wellness'], query: 'dentist,smile,clinic', domain: 'brightsmile.az', focus: 'cosmetic dentistry and preventive oral care' },
  { name: 'Focus Learning Hub', categoryKeys: ['education_training'], query: 'education,classroom,workshop', domain: 'focus.az', focus: 'professional learning and exam readiness' },
  { name: 'FrameCraft Studio', categoryKeys: ['entertainment_media', 'technology_electronics'], query: 'photography,studio,camera', domain: 'framecraft.az', focus: 'photography, brand content and visual storytelling' },
  { name: 'ZenMotion Therapy', categoryKeys: ['health_pharmacy', 'fitness_sports'], query: 'physiotherapy,massage,wellness', domain: 'zenmotion.az', focus: 'massage, mobility and rehabilitation support' },
  { name: 'StyleForge Atelier', categoryKeys: ['fashion_apparel'], query: 'fashion,tailor,atelier', domain: 'styleforge.az', focus: 'tailoring, styling and wardrobe consulting' },
  { name: 'HomeNest Design', categoryKeys: ['home_furniture'], query: 'interior,home,design', domain: 'homenest.az', focus: 'interior planning and home styling' },
  { name: 'TechCare Lab', categoryKeys: ['technology_electronics'], query: 'technology,repair,electronics', domain: 'techcare.az', focus: 'device support, smart setup and tech coaching' },
  { name: 'Baku Kids Academy', categoryKeys: ['education_training', 'entertainment_media'], query: 'kids,learning,creative', domain: 'kidsacademy.az', focus: 'children workshops, tutoring and creative sessions' },
  { name: 'FitFuel Nutrition', categoryKeys: ['fitness_sports', 'health_pharmacy'], query: 'nutrition,healthy,meal', domain: 'fitfuel.az', focus: 'nutrition planning and body composition coaching' },
  { name: 'Eventory Creative', categoryKeys: ['entertainment_media'], query: 'event,creative,party', domain: 'eventory.az', focus: 'events, workshops and creative production' },
  { name: 'TravelMind Baku', categoryKeys: ['travel_hospitality'], query: 'travel,hotel,city', domain: 'travelmind.az', focus: 'local experiences and hospitality planning' },
  { name: 'GreenShelf Flowers', categoryKeys: ['home_furniture', 'beauty_wellness'], query: 'flowers,plants,florist', domain: 'greenshelf.az', focus: 'floral design, plant care and decor' },
  { name: 'LegalWay Advisory', categoryKeys: ['education_training'], query: 'legal,office,documents', domain: 'legalway.az', focus: 'legal document guidance and compliance consulting' },
  { name: 'SoundRoom Academy', categoryKeys: ['education_training', 'entertainment_media'], query: 'music,studio,lesson', domain: 'soundroom.az', focus: 'music lessons, recording and performance coaching' },
] as const;

const BRAND_SERVICE_TEMPLATES: Record<string, Omit<ServiceDef, 'description'>[]> = {
  beauty_wellness: [
    { title: 'Signature Haircut & Styling', category_key: 'haircut_styling', price: 45, price_type: 'FIXED', duration: 45 },
    { title: 'Gloss Colour Refresh', category_key: 'haircut_styling', price: 90, price_type: 'STARTING_FROM', duration: 100 },
    { title: 'Keratin Smooth Treatment', category_key: 'haircut_styling', price: 140, price_type: 'FIXED', duration: 120 },
    { title: 'Luxury Spa Manicure', category_key: 'nail_care', price: 30, price_type: 'FIXED', duration: 40 },
    { title: 'Hard Gel Nail Extensions', category_key: 'nail_care', price: 65, price_type: 'FIXED', duration: 75 },
    { title: 'Deep-Cleanse Facial', category_key: 'facial_treatment', price: 70, price_type: 'FIXED', duration: 60 },
    { title: 'Hyaluronic Hydration Facial', category_key: 'facial_treatment', price: 65, price_type: 'FIXED', duration: 45 },
    { title: 'Collagen Lift Facial', category_key: 'facial_treatment', price: 95, price_type: 'FIXED', duration: 65 },
    { title: 'Back & Shoulder Massage', category_key: 'massage_therapy', price: 55, price_type: 'FIXED', duration: 60 },
    { title: 'Aromatherapy Swedish Massage', category_key: 'massage_therapy', price: 85, price_type: 'FIXED', duration: 90 },
  ],
  fitness_sports: [
    { title: '1-on-1 Personal Training', category_key: 'personal_training', price: 55, price_type: 'FIXED', duration: 60 },
    { title: 'Monthly Coaching Programme', category_key: 'personal_training', price: 380, price_type: 'FIXED', duration: 60 },
    { title: 'HIIT Metabolic Class', category_key: 'personal_training', price: 22, price_type: 'FIXED', duration: 45 },
    { title: 'Strength Conditioning Session', category_key: 'personal_training', price: 60, price_type: 'FIXED', duration: 60 },
    { title: 'Mobility & Stretch Assessment', category_key: 'personal_training', price: 40, price_type: 'FIXED', duration: 40 },
    { title: 'Sports Recovery Massage', category_key: 'massage_therapy', price: 55, price_type: 'FIXED', duration: 60 },
    { title: 'Trigger Point Release', category_key: 'massage_therapy', price: 58, price_type: 'FIXED', duration: 45 },
    { title: 'Progress Photo Session', category_key: 'photo_session', price: 110, price_type: 'FIXED', duration: 60 },
    { title: 'Body Composition Review', category_key: 'consulting', price: 35, price_type: 'FIXED', duration: 30 },
    { title: 'Nutrition Goal Review', category_key: 'consulting', price: 50, price_type: 'FIXED', duration: 45 },
  ],
  health_pharmacy: [
    { title: 'Comprehensive Check-Up', category_key: 'dental_care', price: 35, price_type: 'FIXED', duration: 30 },
    { title: 'Professional Scale & Polish', category_key: 'dental_care', price: 55, price_type: 'FIXED', duration: 45 },
    { title: 'LED Teeth Whitening', category_key: 'dental_care', price: 160, price_type: 'FIXED', duration: 60 },
    { title: 'Composite Filling', category_key: 'dental_care', price: 65, price_type: 'STARTING_FROM', duration: 45 },
    { title: 'Root Canal Treatment', category_key: 'dental_care', price: 220, price_type: 'STARTING_FROM', duration: 90 },
    { title: 'Implant Planning Consultation', category_key: 'dental_care', price_type: 'FREE', duration: 30 },
    { title: 'Porcelain Crown Fitting', category_key: 'dental_care', price: 270, price_type: 'STARTING_FROM', duration: 90 },
    { title: 'Orthodontic Assessment', category_key: 'dental_care', price_type: 'FREE', duration: 40 },
    { title: 'Oral Hygiene Coaching', category_key: 'consulting', price: 40, price_type: 'FIXED', duration: 30 },
    { title: 'Post-Treatment Review', category_key: 'consulting', price_type: 'FREE', duration: 20 },
  ],
  education_training: [
    { title: 'Career Strategy Session', category_key: 'consulting', price: 80, price_type: 'FIXED', duration: 60 },
    { title: 'Business Plan Review', category_key: 'consulting', price: 110, price_type: 'FIXED', duration: 90 },
    { title: 'CV & LinkedIn Optimisation', category_key: 'consulting', price: 55, price_type: 'FIXED', duration: 45 },
    { title: 'Interview Preparation', category_key: 'consulting', price: 65, price_type: 'FIXED', duration: 60 },
    { title: 'Startup Pitch Coaching', category_key: 'consulting', price: 130, price_type: 'FIXED', duration: 90 },
    { title: 'Leadership Coaching', category_key: 'consulting', price: 160, price_type: 'FIXED', duration: 90 },
    { title: 'Team Dynamics Consulting', category_key: 'consulting', price: 220, price_type: 'STARTING_FROM', duration: 120 },
    { title: 'Go-to-Market Workshop', category_key: 'consulting', price: 105, price_type: 'FIXED', duration: 60 },
    { title: 'Financial Planning Session', category_key: 'consulting', price: 85, price_type: 'FIXED', duration: 60 },
    { title: 'Digital Readiness Audit', category_key: 'consulting', price: 160, price_type: 'STARTING_FROM', duration: 90 },
  ],
  default: [
    { title: 'Introductory Consultation', category_key: 'consulting', price: 45, price_type: 'FIXED', duration: 45 },
    { title: 'Personalised Planning Session', category_key: 'consulting', price: 75, price_type: 'FIXED', duration: 60 },
    { title: 'Premium Advisory Package', category_key: 'consulting', price: 150, price_type: 'STARTING_FROM', duration: 90 },
    { title: 'Creative Photo Session', category_key: 'photo_session', price: 120, price_type: 'FIXED', duration: 60 },
    { title: 'Skill-Building Workshop', category_key: 'consulting', price: 90, price_type: 'FIXED', duration: 75 },
    { title: 'Follow-Up Review', category_key: 'consulting', price: 35, price_type: 'FIXED', duration: 30 },
    { title: 'Express Problem Solving', category_key: 'consulting', price: 55, price_type: 'FIXED', duration: 40 },
    { title: 'Implementation Roadmap', category_key: 'consulting', price: 180, price_type: 'STARTING_FROM', duration: 120 },
    { title: 'Portfolio Polish Session', category_key: 'photo_session', price: 100, price_type: 'FIXED', duration: 60 },
    { title: 'Monthly Maintenance Check', category_key: 'consulting', price: 70, price_type: 'FIXED', duration: 50 },
  ],
};

const DIRECT_SERVICE_POOL: Omit<ServiceDef, 'description'>[] = [
  { title: 'Private Career Mentorship', category_key: 'consulting', price: 70, price_type: 'FIXED', duration: 60 },
  { title: 'At-Home Styling Visit', category_key: 'haircut_styling', price: 65, price_type: 'STARTING_FROM', duration: 75 },
  { title: 'Freelance Portrait Session', category_key: 'photo_session', price: 95, price_type: 'FIXED', duration: 60 },
  { title: 'Mobile Recovery Massage', category_key: 'massage_therapy', price: 75, price_type: 'FIXED', duration: 60 },
  { title: 'Nutrition Habit Audit', category_key: 'consulting', price: 45, price_type: 'FIXED', duration: 45 },
  { title: 'Personal Training Trial', category_key: 'personal_training', price: 40, price_type: 'FIXED', duration: 45 },
  { title: 'Remote Business Advisory Call', category_key: 'consulting', price: 85, price_type: 'FIXED', duration: 60 },
  { title: 'Express Nail Care Visit', category_key: 'nail_care', price: 35, price_type: 'FIXED', duration: 40 },
  { title: 'Skin Routine Review', category_key: 'facial_treatment', price: 50, price_type: 'FIXED', duration: 45 },
  { title: 'Dental Second Opinion', category_key: 'dental_care', price_type: 'FREE', duration: 30 },
];

function richDescription(title: string, ownerFocus: string, mode: 'brand' | 'direct'): string {
  const intro = mode === 'brand'
    ? `${title} is delivered inside a fully equipped branch with the same standards, tools, and service flow used across the brand network.`
    : `${title} is offered directly by the service owner, giving customers a personal appointment flow without needing to choose a brand branch.`;

  return [
    `<p>${intro}</p>`,
    `<p>The session is designed around ${ownerFocus}. Before starting, the owner confirms goals, timing, and any special preferences so the experience feels prepared rather than generic.</p>`,
    '<ul>',
    '<li>Clear consultation and expectation setting before the work begins.</li>',
    '<li>Professional tools, clean workflow, and customer-friendly pacing.</li>',
    '<li>Practical aftercare or next-step guidance at the end of the appointment.</li>',
    '</ul>',
    '<p>This mock description intentionally uses paragraphs and lists so rich-text rendering can be tested realistically in service detail screens.</p>',
  ].join('');
}

function pickBrandServiceTemplates(categoryKeys: readonly string[], offset: number): Omit<ServiceDef, 'description'>[] {
  const primary = categoryKeys[0] ?? 'default';
  const templates = BRAND_SERVICE_TEMPLATES[primary] ?? BRAND_SERVICE_TEMPLATES.default;
  return templates.map((template, index) => ({
    ...template,
    title: `${template.title}${offset > 0 ? ` ${offset + 1}` : ''}`,
    price: template.price !== undefined ? template.price + ((offset + index) % 4) * 5 : undefined,
    duration: template.duration + ((offset + index) % 3) * 5,
  }));
}

function pickDirectServices(ownerIndex: number, ownerFocus: string): ServiceDef[] {
  const count = 2 + (ownerIndex % 4);
  return Array.from({ length: count }, (_, index) => {
    const template = DIRECT_SERVICE_POOL[(ownerIndex * 3 + index) % DIRECT_SERVICE_POOL.length];
    return {
      ...template,
      title: `${template.title} ${ownerIndex + 1}.${index + 1}`,
      price: template.price !== undefined ? template.price + ((ownerIndex + index) % 3) * 10 : undefined,
      description: richDescription(template.title, ownerFocus, 'direct'),
    };
  });
}

function buildSeedUsers(): UserSeedDef[] {
  return USER_PROFILES.map(([firstName, lastName], index) => {
    const blueprint = BRAND_BLUEPRINTS[index % BRAND_BLUEPRINTS.length];
    const brandName = index < BRAND_BLUEPRINTS.length
      ? blueprint.name
      : `${blueprint.name} ${index + 1}`;
    const branchDomain = blueprint.domain.replace('.az', `${index + 1}.az`);
    const services = pickBrandServiceTemplates(blueprint.categoryKeys, Math.floor(index / BRAND_BLUEPRINTS.length)).map((service) => ({
      ...service,
      description: richDescription(service.title, blueprint.focus, 'brand'),
    }));

    return {
      email: `marketplace-uso-${index + 1}@reziphay.test`,
      first_name: firstName,
      last_name: lastName,
      phone: `+99450111${String(index + 1).padStart(4, '0')}`,
      brand_name: brandName,
      brand_description: [
        `<p>${brandName} is a marketplace-ready brand focused on ${blueprint.focus} across Baku.</p>`,
        '<p>The seeded profile includes multiple branches, realistic media, service variety, and review data so UCR discovery screens can be tested with richer content.</p>',
      ].join(''),
      brand_category_keys: [...blueprint.categoryKeys],
      image_query: blueprint.query,
      branches: bakuBranches(branchDomain),
      services,
      direct_services: pickDirectServices(index, blueprint.focus),
    };
  });
}

const SEED_USERS: UserSeedDef[] = buildSeedUsers();

// ─── Image generation ─────────────────────────────────────────────────────────


const SERVICE_CATEGORY_QUERIES: Record<string, string> = {
  haircut_styling: 'hair,salon,haircut',
  nail_care: 'nails,manicure,beauty',
  facial_treatment: 'spa,facial,skincare',
  massage_therapy: 'massage,spa,relaxation',
  personal_training: 'fitness,workout,gym',
  photo_session: 'photography,portrait,camera',
  dental_care: 'dental,teeth,smile',
  consulting: 'business,meeting,office',
};

function queryToLock(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000) + 1;
}

async function fetchThematicImage(width: number, height: number, query: string, lockKey: string): Promise<Buffer> {
  const lock = queryToLock(lockKey);
  const url = `https://loremflickr.com/${width}/${height}/${encodeURIComponent(query)}?lock=${lock}`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Image fetch failed (${response.status}) for query "${query}"`);
  const arrayBuffer = await response.arrayBuffer();
  return sharp(Buffer.from(arrayBuffer)).webp({ quality: 80 }).toBuffer();
}

// ─── Media helpers ────────────────────────────────────────────────────────────

type SeedMediaKind = 'other' | 'branch_cover' | 'service_image';

async function createMediaRecord(
  userId: string,
  buffer: Buffer,
  name: string,
  kind: SeedMediaKind,
  width: number,
  height: number,
): Promise<string> {
  await ensureSeedUserDir(userId);
  const storagePath = buildSeedStoragePath(userId);
  await fs.writeFile(storagePath, buffer);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const media = await prisma.media.create({
    data: {
      name,
      format: 'webp',
      mime_type: 'image/webp',
      size: buffer.length,
      kind,
      storage_path: storagePath,
      checksum,
      is_public: true,
      owner_id: userId,
      width,
      height,
    },
    select: { id: true },
  });
  return media.id;
}

// ─── Per-user seeding ─────────────────────────────────────────────────────────

async function seedUser(
  userDef: UserSeedDef,
  categoryMaps: { brand: Map<string, string>; service: Map<string, string> },
): Promise<SeededMarketplaceOwner> {
  const hashedPw = await hashPassword('Password123');

  // Clean up any existing seed data for this email
  const existing = await prisma.user.findUnique({
    where: { email: userDef.email },
    select: { id: true },
  });
  if (existing) {
    await deleteSeedUserDir(existing.id);
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const user = await prisma.user.create({
    data: {
      first_name: userDef.first_name,
      last_name: userDef.last_name,
      birthday: new Date('1990-01-01'),
      country: 'AZ',
      email: userDef.email,
      phone: userDef.phone,
      hashed_password: hashedPw,
      type: 'uso',
      email_verified: true,
      phone_verified: true,
    },
    select: { id: true },
  });
  const userId = user.id;
  const serviceIds: string[] = [];

  // Brand logo (1:1)
  const logoBuffer = await fetchThematicImage(512, 512, userDef.image_query, `${userDef.brand_name}-logo`);
  const logoMediaId = await createMediaRecord(
    userId,
    logoBuffer,
    `${userDef.brand_name} Logo`,
    'other',
    512,
    512,
  );

  // Brand gallery (16:9)
  const galleryBuffer = await fetchThematicImage(1280, 720, userDef.image_query, `${userDef.brand_name}-gallery`);
  const galleryMediaId = await createMediaRecord(
    userId,
    galleryBuffer,
    `${userDef.brand_name} Gallery`,
    'other',
    1280,
    720,
  );

  const brandCatIds = userDef.brand_category_keys
    .map((key) => categoryMaps.brand.get(key))
    .filter((id): id is string => id !== undefined);

  const brand = await prisma.brand.create({
    data: {
      name: userDef.brand_name,
      description: userDef.brand_description,
      owner_id: userId,
      status: 'ACTIVE',
      logo_media_id: logoMediaId,
      categories: { connect: brandCatIds.map((id) => ({ id })) },
      gallery: { create: [{ media_id: galleryMediaId, order: 0 }] },
    },
    select: { id: true },
  });
  const brandId = brand.id;

  // Branches
  const branchIds: string[] = [];
  for (const branchDef of userDef.branches) {
    const coverBuffer = await fetchThematicImage(1280, 720, userDef.image_query, `${userDef.brand_name}-${branchDef.name}`);
    const coverMediaId = await createMediaRecord(
      userId,
      coverBuffer,
      `${branchDef.name} Cover`,
      'branch_cover',
      1280,
      720,
    );

    const branch = await prisma.branch.create({
      data: {
        brand_id: brandId,
        name: branchDef.name,
        address1: branchDef.address1,
        phone: branchDef.phone,
        email: branchDef.email,
        opening: '09:00',
        closing: '21:00',
        cover_media_id: coverMediaId,
      },
      select: { id: true },
    });

    await prisma.team.create({
      data: {
        branch_id: branch.id,
        created_by_user_id: userId,
        members: {
          create: {
            user_id: userId,
            invited_by_user_id: userId,
            role: 'OWNER',
            status: 'ACCEPTED',
          },
        },
      },
    });

    branchIds.push(branch.id);
  }

  async function createSeedService(svcDef: ServiceDef, index: number, branchId: string | null) {
    const catId = categoryMaps.service.get(svcDef.category_key);
    if (!catId) {
      console.warn(
        `  [WARN] Service category '${svcDef.category_key}' not found — skipping '${svcDef.title}'`,
      );
      return;
    }

    const svcQuery = SERVICE_CATEGORY_QUERIES[svcDef.category_key] ?? userDef.image_query;
    const imageLock = branchId
      ? `${userDef.brand_name}-${svcDef.title}`
      : `${userDef.email}-direct-${svcDef.title}`;
    const imgBuffer = await fetchThematicImage(1280, 720, svcQuery, imageLock);
    const imgMediaId = await createMediaRecord(
      userId,
      imgBuffer,
      `${svcDef.title} Image`,
      'service_image',
      1280,
      720,
    );

    const service = await prisma.service.create({
      data: {
        title: svcDef.title,
        description: svcDef.description,
        owner_id: userId,
        branch_id: branchId,
        service_category_id: catId,
        price: svcDef.price ?? null,
        price_type: svcDef.price_type,
        duration: svcDef.duration,
        address: branchId ? null : userDef.branches[index % userDef.branches.length]?.address1,
        status: 'ACTIVE',
        images: { create: [{ media_id: imgMediaId, order: 0 }] },
      },
      select: { id: true },
    });
    serviceIds.push(service.id);
  }

  // Brand services distributed across branches
  for (let i = 0; i < userDef.services.length; i++) {
    const svcDef = userDef.services[i];
    const branchId = branchIds[i % branchIds.length];
    await createSeedService(svcDef, i, branchId);
  }

  // Direct user services without a brand/branch context
  for (let i = 0; i < userDef.direct_services.length; i++) {
    await createSeedService(userDef.direct_services[i], i, null);
  }

  console.log(
    `  ✓ ${userDef.first_name} ${userDef.last_name} → ${userDef.brand_name}` +
      ` | ${userDef.branches.length} branches | ${userDef.services.length} brand services` +
      ` | ${userDef.direct_services.length} direct services`,
  );

  return { userId, brandId, serviceIds };
}

async function seedBrandRatings(records: SeededMarketplaceOwner[]): Promise<number> {
  const ratings = records.flatMap((record) => {
    const raters = deterministicOrder(
      records.filter((r) => r.userId !== record.userId),
      `${record.brandId}:raters`,
      (rater) => rater.userId,
    );
    const count = Math.min(
      raters.length,
      deterministicNumber(`${record.brandId}:rating-count`, 5, 18),
    );
    if (count === 0) return [];

    const values = buildRatingValues(record.brandId, count);

    return raters.slice(0, count).map((rater, ratingIndex) => ({
      brand_id: record.brandId,
      user_id: rater.userId,
      value: values[ratingIndex] ?? 4,
    }));
  });

  if (ratings.length === 0) return 0;

  process.stdout.write(`Seeding brand ratings (${ratings.length}) ... `);
  for (let i = 0; i < ratings.length; i += 100) {
    await prisma.brandRating.createMany({
      data: ratings.slice(i, i + 100),
      skipDuplicates: true,
    });
  }
  console.log('✓');

  return ratings.length;
}

async function seedServiceRatings(records: SeededMarketplaceOwner[]): Promise<number> {
  const serviceRecords = records.flatMap((record) =>
    record.serviceIds.map((serviceId) => ({
      serviceId,
      ownerId: record.userId,
    })),
  );

  const ratings = serviceRecords.flatMap((service) => {
    const raters = deterministicOrder(
      records.filter((r) => r.userId !== service.ownerId),
      `${service.serviceId}:raters`,
      (rater) => rater.userId,
    );
    const count = Math.min(
      raters.length,
      deterministicNumber(`${service.serviceId}:rating-count`, 3, 16),
    );
    if (count === 0) return [];

    const values = buildRatingValues(service.serviceId, count);

    return raters.slice(0, count).map((rater, ratingIndex) => ({
      service_id: service.serviceId,
      user_id: rater.userId,
      value: values[ratingIndex] ?? 4,
    }));
  });

  if (ratings.length === 0) return 0;

  process.stdout.write(`Seeding service ratings (${ratings.length}) ... `);
  for (let i = 0; i < ratings.length; i += 250) {
    await prisma.serviceRating.createMany({
      data: ratings.slice(i, i + 250),
      skipDuplicates: true,
    });
  }
  console.log('✓');

  return ratings.length;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Seeding marketplace mock data...\n');

  await seedBrandCategories();
  await seedServiceCategories();

  const [brandCategories, serviceCategories] = await Promise.all([
    prisma.brandCategory.findMany({ select: { id: true, key: true } }),
    prisma.serviceCategory.findMany({ select: { id: true, key: true } }),
  ]);

  const categoryMaps = {
    brand: new Map(brandCategories.map((c) => [c.key, c.id])),
    service: new Map(serviceCategories.map((c) => [c.key, c.id])),
  };

  const seededRecords: SeededMarketplaceOwner[] = [];

  for (const userDef of SEED_USERS) {
    process.stdout.write(`Seeding: ${userDef.email} ... `);
    seededRecords.push(await seedUser(userDef, categoryMaps));
  }

  const brandRatingCount = await seedBrandRatings(seededRecords);
  const serviceRatingCount = await seedServiceRatings(seededRecords);

  const totals = {
    users: SEED_USERS.length,
    brands: SEED_USERS.length,
    branches: SEED_USERS.length * 8,
    brandServices: SEED_USERS.reduce((sum, u) => sum + u.services.length, 0),
    directServices: SEED_USERS.reduce((sum, u) => sum + u.direct_services.length, 0),
    brandRatings: brandRatingCount,
    serviceRatings: serviceRatingCount,
  };

  console.log(
    `\nDone. Created ${totals.users} users, ${totals.brands} brands,` +
      ` ${totals.branches} branches, ${totals.brandServices} brand services,` +
      ` ${totals.directServices} direct user services, ${totals.brandRatings} brand ratings,` +
      ` ${totals.serviceRatings} service ratings.`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
