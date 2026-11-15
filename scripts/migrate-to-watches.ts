import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("Migrating database products and categories to watches...");

  const menCat = await db.category.findUnique({ where: { slug: "men" } });
  const autoCat = await db.category.findUnique({ where: { slug: "automatic" } });
  const chronoCat = await db.category.findUnique({ where: { slug: "chronograph" } });

  // 1. Update 'everyday-street-sneaker'
  const p1 = await db.product.findUnique({ where: { slug: "everyday-street-sneaker" } });
  if (p1 && chronoCat) {
    await db.product.update({
      where: { id: p1.id },
      data: {
        name: "Aquaracer Chrono Diver 43mm",
        slug: "aquaracer-chrono-diver-43mm",
        description:
          "High-performance marine chronograph with 300m water resistance, ceramic bezel, and dual sub-dials.",
        basePrice: 39500,
        imageUrl: "/watches/watch-02.jpg",
        categoryId: chronoCat.id,
      },
    });
    const v1 = await db.productVariant.findMany({ where: { productId: p1.id } });
    const names1 = [
      "43mm - Ocean Blue Steel",
      "43mm - Matte Black Rubber",
      "41mm - Steel Bracelet",
    ];
    for (let i = 0; i < v1.length; i++) {
      await db.productVariant.update({
        where: { id: v1[i].id },
        data: { name: names1[i] || `43mm Edition ${i + 1}` },
      });
    }
    console.log("Updated 'everyday-street-sneaker' -> 'Aquaracer Chrono Diver 43mm'");
  }

  // 2. Update 'urban-classic-oxford'
  const p2 = await db.product.findUnique({ where: { slug: "urban-classic-oxford" } });
  if (p2 && menCat) {
    await db.product.update({
      where: { id: p2.id },
      data: {
        name: "Heritage Pilot Chronometer 42mm",
        slug: "heritage-pilot-chronometer-42mm",
        description:
          "Vintage aviator-inspired chronometer with anti-reflective sapphire, tachymeter scale, and genuine brown calfskin strap.",
        basePrice: 44000,
        imageUrl: "/watches/watch-04.jpg",
        categoryId: menCat.id,
      },
    });
    const v2 = await db.productVariant.findMany({ where: { productId: p2.id } });
    const names2 = [
      "42mm - Saddle Brown Leather",
      "42mm - Midnight Black Leather",
      "42mm - Brushed Steel",
    ];
    for (let i = 0; i < v2.length; i++) {
      await db.productVariant.update({
        where: { id: v2[i].id },
        data: { name: names2[i] || `42mm Edition ${i + 1}` },
      });
    }
    console.log("Updated 'urban-classic-oxford' -> 'Heritage Pilot Chronometer 42mm'");
  }

  // 3. Update 'stride-aero-runner'
  const p3 = await db.product.findUnique({ where: { slug: "stride-aero-runner" } });
  if (p3 && autoCat) {
    await db.product.update({
      where: { id: p3.id },
      data: {
        name: "Seafarer Automatic Master 41mm",
        slug: "seafarer-automatic-master-41mm",
        description:
          "Luxury mechanical self-winding timepiece with exhibition caseback, 24 jewels, and surgical-grade 316L steel.",
        basePrice: 47000,
        imageUrl: "/watches/watch-01.jpg",
        categoryId: autoCat.id,
      },
    });
    const v3 = await db.productVariant.findMany({ where: { productId: p3.id } });
    const names3 = [
      "41mm - Stainless Steel",
      "41mm - Rose Gold Accent",
      "41mm - Black Milanese Mesh",
      "39mm - Silver Bracelet",
    ];
    for (let i = 0; i < v3.length; i++) {
      await db.productVariant.update({
        where: { id: v3[i].id },
        data: { name: names3[i] || `41mm Edition ${i + 1}` },
      });
    }
    console.log("Updated 'stride-aero-runner' -> 'Seafarer Automatic Master 41mm'");
  }

  // 4. Delete Footwear category if now empty
  const footwear = await db.category.findUnique({
    where: { slug: "footwear" },
    include: { products: true },
  });
  if (footwear && footwear.products.length === 0) {
    await db.category.delete({ where: { slug: "footwear" } });
    console.log("Deleted empty 'Footwear' category.");
  }

  const all = await db.product.findMany({
    select: { name: true, category: { select: { name: true } } },
  });
  console.log(`All ${all.length} products are now watches:`);
  console.table(all.map((p) => ({ Product: p.name, Category: p.category.name })));
}

main()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

