/**
 * Testes end-to-end da API HTTP do os-service.
 *
 * Sobe o AppModule completo (controllers, guards JWT, ValidationPipe, módulos de
 * mensageria e observabilidade) com a mesma configuração do main.ts e exercita a
 * API via HTTP com supertest. Apenas o PrismaService é substituído por um dublê,
 * para o teste não depender de um PostgreSQL em execução; o RabbitMQ roda em modo
 * in-memory (NODE_ENV=test).
 *
 * O fluxo completo entre os 3 microsserviços (com RabbitMQ, PostgreSQL e MongoDB
 * reais no Kubernetes) é coberto por scripts/saga-e2e.sh.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret';
process.env.NODE_ENV = 'test';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/prisma/prisma.service';

describe('OS Service API (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;

  const customers: any[] = [];
  const prismaMock = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    customer: {
      findMany: jest.fn(async () => [...customers]),
      findUnique: jest.fn(
        async ({ where }) =>
          customers.find((c) => c.id === where.id || c.document === where.document) ?? null,
      ),
      create: jest.fn(async ({ data }) => {
        const customer = { id: `cust-${customers.length + 1}`, isActive: true, ...data };
        customers.push(customer);
        return customer;
      }),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication({ logger: false });
    // Mesma configuração aplicada em src/main.ts
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    token = app
      .get(JwtService)
      .sign({ sub: 'admin-e2e', email: 'admin@oficina.local', role: 'ADMIN' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health checks (rotas públicas usadas pelo Kubernetes)', () => {
    it('GET /api/health responde liveness com o status da mensageria', async () => {
      const res = await request(app.getHttpServer()).get('/api/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', messaging: 'in-memory' });
    });

    it('GET /api/health/ready responde 200 quando o banco está acessível', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    });

    it('GET /api/health/ready responde 503 quando o banco está indisponível', async () => {
      prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
      const res = await request(app.getHttpServer()).get('/api/health/ready').expect(503);
      expect(res.body).toMatchObject({ status: 'error', database: 'down' });
    });
  });

  describe('Autenticação JWT nas rotas administrativas', () => {
    it('GET /api/customers sem token responde 401', async () => {
      await request(app.getHttpServer()).get('/api/customers').expect(401);
    });

    it('GET /api/customers com token inválido responde 401', async () => {
      await request(app.getHttpServer())
        .get('/api/customers')
        .set('Authorization', 'Bearer token-invalido')
        .expect(401);
    });

    it('GET /api/customers com JWT válido responde 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Cadastro de cliente (validação de entrada e regra de CPF)', () => {
    it('POST /api/customers rejeita payload com campos inválidos (ValidationPipe)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Jo', documentType: 'RG', document: 123, campoExtra: true })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('documentType');
    });

    it('POST /api/customers rejeita CPF com dígito verificador inválido', async () => {
      await request(app.getHttpServer())
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'João da Silva', documentType: 'CPF', document: '123.456.789-00' })
        .expect(400);
    });

    it('POST /api/customers cria cliente com CPF válido e normaliza o documento', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'João da Silva',
          documentType: 'CPF',
          document: '529.982.247-25',
          email: 'joao@email.com',
        })
        .expect(201);
      expect(res.body).toMatchObject({ name: 'João da Silva', document: '52998224725' });
    });

    it('POST /api/customers impede documento duplicado', async () => {
      await request(app.getHttpServer())
        .post('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Outro Cliente', documentType: 'CPF', document: '52998224725' })
        .expect(400);
    });

    it('GET /api/customers lista o cliente criado', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/customers')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].document).toBe('52998224725');
    });
  });
});
