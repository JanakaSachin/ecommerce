import { PrismaClient, ParcelSize, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DISTRICTS } from "../src/lib/districts";

const prisma = new PrismaClient();

const PROVINCE_ZONES = [
  { n: 1, code: "WP", name: "Western" },
  { n: 2, code: "CP", name: "Central" },
  { n: 3, code: "SP", name: "Southern" },
  { n: 4, code: "NP", name: "Northern" },
  { n: 5, code: "EP", name: "Eastern" },
  { n: 6, code: "NWP", name: "North Western" },
  { n: 7, code: "NCP", name: "North Central" },
  { n: 8, code: "UVA", name: "Uva" },
  { n: 9, code: "SAB", name: "Sabaragamuwa" },
];

function mockZoneId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

async function main() {
  console.log("Seeding database...");

  // 1. Admin user
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@stridelk.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "Admin12345!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, role: Role.ADMIN },
    create: {
      email: adminEmail,
      name: "Store Administrator",
      passwordHash,
      role: Role.ADMIN,
    },
  });
  console.log(`Admin user created: ${admin.email}`);

  // 2. Sample Categories & Products
  const shoesCategory = await prisma.category.upsert({
    where: { slug: "footwear" },
    update: {},
    create: {
      name: "Footwear",
      slug: "footwear",
      description: "Premium footwear crafted for comfort and style.",
    },
  });

  const productsData = [
    {
      name: "Stride Aero Runner",
      slug: "stride-aero-runner",
      description: "Lightweight running shoes with responsive cushioning.",
      basePrice: 12500,
      variants: [
        { name: "Size 40 - Black", sku: "SAR-BLK-40", price: 12500, stock: 25 },
        { name: "Size 41 - Black", sku: "SAR-BLK-41", price: 12500, stock: 30 },
        { name: "Size 42 - Black", sku: "SAR-BLK-42", price: 12500, stock: 35 },
        { name: "Size 43 - White", sku: "SAR-WHT-43", price: 12500, stock: 20 },
      ],
    },
    {
      name: "Urban Classic Oxford",
      slug: "urban-classic-oxford",
      description: "Handcrafted full-grain leather shoes for formal occasions.",
      basePrice: 18000,
      variants: [
        { name: "Size 41 - Brown", sku: "UCO-BRN-41", price: 18000, stock: 15 },
        { name: "Size 42 - Brown", sku: "UCO-BRN-42", price: 18000, stock: 20 },
        { name: "Size 43 - Black", sku: "UCO-BLK-43", price: 18000, stock: 18 },
      ],
    },
    {
      name: "Everyday Street Sneaker",
      slug: "everyday-street-sneaker",
      description: "Casual canvas sneakers built for all-day comfort.",
      basePrice: 8500,
      variants: [
        { name: "Size 39 - Navy", sku: "ESS-NVY-39", price: 8500, stock: 40 },
        { name: "Size 40 - Navy", sku: "ESS-NVY-40", price: 8500, stock: 45 },
        { name: "Size 41 - Grey", sku: "ESS-GRY-41", price: 8500, stock: 50 },
      ],
    },
  ];

  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: { basePrice: p.basePrice },
      create: {
        name: p.name,
        slug: p.slug,
        description: p.description,
        basePrice: p.basePrice,
        categoryId: shoesCategory.id,
      },
    });

    for (const v of p.variants) {
      await prisma.productVariant.upsert({
        where: { sku: v.sku },
        update: { stock: v.stock, price: v.price },
        create: {
          productId: product.id,
          name: v.name,
          sku: v.sku,
          price: v.price,
          stock: v.stock,
        },
      });
    }
  }
  console.log("Sample catalog populated.");

  // 3. SwiftDrop Zones (Mock mode default 9 zones)
  const zoneMap = new Map<string, string>();
  for (const z of PROVINCE_ZONES) {
    const id = mockZoneId(z.n);
    await prisma.deliveryZone.upsert({
      where: { id },
      update: { code: z.code, name: z.name, active: true },
      create: {
        id,
        code: z.code,
        name: z.name,
        active: true,
      },
    });
    zoneMap.set(z.code, id);
  }
  console.log(`Seeded ${PROVINCE_ZONES.length} delivery zones.`);

  // 4. District -> Zone Mappings
  for (const [district, provinceCode] of Object.entries(DISTRICTS)) {
    const zoneId = zoneMap.get(provinceCode);
    if (zoneId) {
      await prisma.districtZone.upsert({
        where: { district },
        update: { zoneId },
        create: { district, zoneId },
      });
    }
  }
  console.log(`Mapped ${Object.keys(DISTRICTS).length} districts to delivery zones.`);

  // 5. Delivery Rates (what we charge customers)
  for (const z of PROVINCE_ZONES) {
    const zoneId = zoneMap.get(z.code)!;
    const isWestern = z.code === "WP";

    const rates: { size: ParcelSize; fee: number }[] = [
      { size: ParcelSize.SMALL, fee: isWestern ? 350 : 450 },
      { size: ParcelSize.MEDIUM, fee: isWestern ? 400 : 500 },
      { size: ParcelSize.LARGE, fee: isWestern ? 550 : 700 },
    ];

    for (const rate of rates) {
      await prisma.deliveryRate.upsert({
        where: { zoneId_size: { zoneId, size: rate.size } },
        update: { fee: rate.fee },
        create: {
          zoneId,
          size: rate.size,
          fee: rate.fee,
        },
      });
    }
  }
  console.log("Seeded delivery rates for all zones.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
