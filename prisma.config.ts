import { defineConfig, env } from 'prisma/config';

// Prisma 7: a configuração do banco para a CLI (migrate/generate) vem daqui.
// O schema.prisma não tem "url" no datasource — quem fornece a conexão é este arquivo.
// Obs.: não importamos "dotenv/config" de propósito (dotenv não está no package.json).
// Em todos os cenários o DATABASE_URL já é uma variável de ambiente real:
//  - no build:        é passado inline (docker build)
//  - no Kubernetes:   vem do Secret oficina-secrets (initContainer)
//  - local:           exporte DATABASE_URL antes de rodar o prisma
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});