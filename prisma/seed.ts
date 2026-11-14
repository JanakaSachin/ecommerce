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
  console.log("Seeding watch catalog and database...");

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

  // 2. Watch Categories
  const categoriesData = [
    {
      name: "Men's Watches",
      slug: "men",
      description: "Bold chronographs, divers, and executive steel timepieces.",
    },
    {
      name: "Women's Watches",
      slug: "women",
      description: "Sophisticated jewelry watches, rose gold finishes, and delicate dials.",
    },
    {
      name: "Automatic & Mechanical",
      slug: "automatic",
      description: "Self-winding mechanical movements, open-heart displays, and skeleton calibers.",
    },
    {
      name: "Chronograph",
      slug: "chronograph",
      description: "Precision racing and aviation multi-dial stopwatches.",
    },
    {
      name: "Smartwatches",
      slug: "smartwatches",
      description: "Connected hybrid and AMOLED fitness smartwatches with sapphire glass.",
    },
    {
      name: "Classic & Dress",
      slug: "classic",
      description: "Ultra-slim minimalist dress watches with genuine Italian leather straps.",
    },
  ];

  const categoriesMap = new Map<string, string>();
  for (const c of categoriesData) {
    const record = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description },
      create: c,
    });
    categoriesMap.set(c.slug, record.id);
  }

  // 3. Watch Products & Editions
  const productsData = [
    {
      name: "Chrono Heritage Automatic 42mm",
      slug: "chrono-heritage-automatic-42mm",
      description:
        "Handcrafted automatic timepiece featuring an exhibition sapphire caseback, 42-hour power reserve, and 316L surgical stainless steel.",
      basePrice: 48500,
      imageUrl: "/watches/watch-01.jpg",
      categorySlug: "automatic",
      variants: [
        { name: "42mm - Stainless Steel Bracelet", sku: "CHA-42-STL", price: 48500, stock: 15 },
        { name: "42mm - Midnight Blue Alligator Leather", sku: "CHA-42-BLU", price: 48500, stock: 12 },
        { name: "40mm - Milanese Mesh Strap", sku: "CHA-40-MSH", price: 46500, stock: 10 },
      ],
    },
    {
      name: "Nautilus Diver Pro 300M",
      slug: "nautilus-diver-pro-300m",
      description:
        "Professional 300m water-resistant diving instrument with unidirectional rotating ceramic bezel, helium valve, and Super-LumiNova markers.",
      basePrice: 38000,
      imageUrl: "/watches/watch-02.jpg",
      categorySlug: "men",
      variants: [
        { name: "43mm - Ocean Blue / Steel Bracelet", sku: "NDP-43-BLU", price: 38000, stock: 20 },
        { name: "43mm - Matte Black / Fluoroelastomer Rubber", sku: "NDP-43-BLK", price: 36000, stock: 18 },
      ],
    },
    {
      name: "AeroMaster Pilot Chronograph",
      slug: "aeromaster-pilot-chronograph",
      description:
        "Aviation-grade high precision chronograph with tachymeter scale, anti-magnetic inner shield, and anti-reflective coated sapphire.",
      basePrice: 42000,
      imageUrl: "/watches/watch-03.jpg",
      categorySlug: "chronograph",
      variants: [
        { name: "44mm - Gunmetal PVD / Saddle Leather", sku: "AMP-44-SAD", price: 42000, stock: 14 },
        { name: "44mm - Brushed Steel / Black Pilot Strap", sku: "AMP-44-BLK", price: 42000, stock: 16 },
      ],
    },
    {
      name: "Monaco Grand Prix Chronograph",
      slug: "monaco-grand-prix-chronograph",
      description:
        "Vintage racing stopwatch with dual sunray sub-dials, sapphire crystal, and breathable perforated rally leather strap.",
      basePrice: 35500,
      imageUrl: "/watches/watch-04.jpg",
      categorySlug: "chronograph",
      variants: [
        { name: "41mm - Racing White / Perforated Black", sku: "MGP-41-WHT", price: 35500, stock: 22 },
        { name: "41mm - Anthracite / Orange Stitching", sku: "MGP-41-ANT", price: 35500, stock: 15 },
      ],
    },
    {
      name: "Lumiere Minimalist Dress Watch",
      slug: "lumiere-minimalist-dress-watch",
      description:
        "Ultra-slim 6.8mm profile executive dress watch with understated sunburst dial and supple Italian calfskin leather.",
      basePrice: 26000,
      imageUrl: "/watches/watch-05.jpg",
      categorySlug: "classic",
      variants: [
        { name: "38mm - Rose Gold / Espresso Leather", sku: "LMD-38-ROS", price: 26000, stock: 25 },
        { name: "38mm - Silver / Midnight Black Leather", sku: "LMD-38-SLV", price: 26000, stock: 30 },
        { name: "40mm - Champagne Gold / Honey Brown", sku: "LMD-40-GLD", price: 27500, stock: 18 },
      ],
    },
    {
      name: "Apex Titanium Connected Smartwatch",
      slug: "apex-titanium-connected-smartwatch",
      description:
        "Aerospace grade 5 titanium smartwatch featuring always-on AMOLED touchscreen, titanium bezel, SpO2 sensor, and 14-day battery life.",
      basePrice: 52000,
      imageUrl: "/watches/watch-06.jpg",
      categorySlug: "smartwatches",
      variants: [
        { name: "45mm - DLC Matte Black / Titanium Link", sku: "ATC-45-BLK", price: 54000, stock: 12 },
        { name: "45mm - Raw Titanium / Sport Silicone", sku: "ATC-45-RAW", price: 52000, stock: 20 },
      ],
    },
    {
      name: "Symphony Skeleton Automatic",
      slug: "symphony-skeleton-automatic",
      description:
        "Exquisite open-worked skeleton timepiece revealing the hand-finished 24-jewel automatic movement and gold-toned balance wheel.",
      basePrice: 65000,
      imageUrl: "/watches/watch-07.jpg",
      categorySlug: "automatic",
      variants: [
        { name: "42mm - Polished Steel / Black Leather", sku: "SSA-42-STL", price: 65000, stock: 8 },
        { name: "42mm - Rose Gold / Havana Brown Leather", sku: "SSA-42-ROS", price: 68000, stock: 6 },
      ],
    },
    {
      name: "Petite Diamond Edition",
      slug: "petite-diamond-edition",
      description:
        "Fine jewelry women's timepiece adorned with hand-set brilliant crystals, natural mother-of-pearl dial, and jewelry clasp bracelet.",
      basePrice: 29500,
      imageUrl: "/watches/watch-08.jpg",
      categorySlug: "women",
      variants: [
        { name: "32mm - Two-Tone Rose Gold & Silver", sku: "PDE-32-TWT", price: 29500, stock: 15 },
        { name: "32mm - Pure Silver Milanese Mesh", sku: "PDE-32-SLV", price: 28000, stock: 20 },
        { name: "34mm - Champagne Gold Bracelet", sku: "PDE-34-GLD", price: 31000, stock: 12 },
      ],
    },
  ];

  for (const p of productsData) {
    const categoryId = categoriesMap.get(p.categorySlug);
    if (!categoryId) continue;

    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        description: p.description,
        basePrice: p.basePrice,
        imageUrl: p.imageUrl,
        categoryId,
      },
      create: {
        name: p.name,
        slug: p.slug,
        description: p.description,
        basePrice: p.basePrice,
        imageUrl: p.imageUrl,
        categoryId,
      },
    });

    for (const v of p.variants) {
      await prisma.productVariant.upsert({
        where: { sku: v.sku },
        update: { name: v.name, price: v.price, stock: v.stock },
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
  console.log(`Created ${productsData.length} watch collections with variants.`);

  // 4. Delivery Zones (9 Provinces)
  const now = new Date();
  for (const z of PROVINCE_ZONES) {
    const zoneId = mockZoneId(z.n);
    await prisma.deliveryZone.upsert({
      where: { id: zoneId },
      update: { code: z.code, name: z.name, syncedAt: now, active: true },
      create: { id: zoneId, code: z.code, name: z.name, syncedAt: now, active: true },
    });
  }

  // 5. District-to-Zone Mappings (All 25 Districts)
  for (const [district, provinceCode] of Object.entries(DISTRICTS)) {
    const zone = PROVINCE_ZONES.find((z) => z.code === provinceCode);
    if (zone) {
      const zoneId = mockZoneId(zone.n);
      await prisma.districtZone.upsert({
        where: { district },
        update: { zoneId },
        create: { district, zoneId },
      });
    }
  }

  // 6. Delivery Rates per Zone & Size
  for (const z of PROVINCE_ZONES) {
    const zoneId = mockZoneId(z.n);
    const rates: { size: ParcelSize; fee: number }[] =
      z.code === "WP"
        ? [
            { size: ParcelSize.SMALL, fee: 350 },
            { size: ParcelSize.MEDIUM, fee: 450 },
            { size: ParcelSize.LARGE, fee: 600 },
          ]
        : [
            { size: ParcelSize.SMALL, fee: 450 },
            { size: ParcelSize.MEDIUM, fee: 550 },
            { size: ParcelSize.LARGE, fee: 750 },
          ];

    for (const r of rates) {
      await prisma.deliveryRate.upsert({
        where: { zoneId_size: { zoneId, size: r.size } },
        update: { fee: r.fee },
        create: { zoneId, size: r.size, fee: r.fee },
      });
    }
  }

  console.log("Database seeded successfully with luxury watch catalog!");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
