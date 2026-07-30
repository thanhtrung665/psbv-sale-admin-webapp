import { prisma } from '../lib/prisma'
import bcrypt from 'bcryptjs'

async function main() {
  console.log('Seeding Master Admin account...')
  
  const hashedPassword = await bcrypt.hash('Admin@123', 10)
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@psbv.com' },
    update: {},
    create: {
      email: 'admin@psbv.com',
      password: hashedPassword,
      name: 'Master Admin',
      role: 'ADMIN',
      isActive: true,
    },
  })
  
  console.log('Master Admin created:', admin.email)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
