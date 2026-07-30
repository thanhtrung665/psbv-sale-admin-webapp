import { prisma } from "../lib/prisma";

async function main() {
  const supplier = await prisma.supplier.upsert({
    where: { email: "sales@keystone.com" }, // Using a dummy email to match or we can match by name if we didn't have email unique. Wait, email is unique. Let's just create or update.
    update: {
      name: "Keystone",
      companyName: "Keystone Electronics Corp.",
      logoUrl: "https://nvcanmdfdmyllvopxdst.supabase.co/storage/v1/object/public/assets/keystone.logo.png",
    },
    create: {
      name: "Keystone",
      companyName: "Keystone Electronics Corp.",
      email: "sales@keystone.com",
      recipientName: "Keystone Sales",
      logoUrl: "https://nvcanmdfdmyllvopxdst.supabase.co/storage/v1/object/public/assets/keystone.logo.png",
    }
  });
  console.log("Seeded Keystone supplier:", supplier);
}

main().catch(console.error).finally(() => prisma.$disconnect());
