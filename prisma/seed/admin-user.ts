import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });

  const prisma = new PrismaClient({ adapter });

  const passwordHash = await bcrypt.hash('123456', 10);

  const existingUser = await prisma.adminUser.findUnique({
    where: {
      email: 'admin@oficina.com',
    },
  });

  if (!existingUser) {
    await prisma.adminUser.create({
      data: {
        name: 'Admin',
        email: 'admin@oficina.com',
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
    });

    console.log('Usuário admin criado com sucesso.');
  } else {
    console.log('Usuário admin já existe.');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Erro ao criar usuário admin:', error);
  process.exit(1);
});