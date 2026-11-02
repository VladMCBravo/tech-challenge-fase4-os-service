jest.mock('../shared/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    adminUser: {
      findUnique: jest.fn(),
    },
  };

  const jwtServiceMock = {
    signAsync: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('deve fazer login com credenciais válidas', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Admin',
      email: 'admin@oficina.com',
      passwordHash: 'hash',
      role: 'ADMIN',
      isActive: true,
    });

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    jwtServiceMock.signAsync.mockResolvedValue('fake-jwt-token');

    const result = await service.login({
      email: 'admin@oficina.com',
      password: '123456',
    });

    expect(result).toEqual({
      access_token: 'fake-jwt-token',
      user: {
        id: 'user-1',
        name: 'Admin',
        email: 'admin@oficina.com',
        role: 'ADMIN',
      },
    });
  });

  it('deve rejeitar login quando usuário não existe', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'admin@oficina.com',
        password: '123456',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deve rejeitar login quando senha é inválida', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Admin',
      email: 'admin@oficina.com',
      passwordHash: 'hash',
      role: 'ADMIN',
      isActive: true,
    });

    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({
        email: 'admin@oficina.com',
        password: '123456',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deve retornar os dados do usuário autenticado em me()', async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Admin',
      email: 'admin@oficina.com',
      role: 'ADMIN',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.me('user-1');

    expect(result.id).toBe('user-1');
    expect(result.email).toBe('admin@oficina.com');
  });
});