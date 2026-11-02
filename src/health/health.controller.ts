import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../shared/prisma/prisma.service';

/**
 * Healthchecks (rotas PÚBLICAS — sem JwtAuthGuard) para Kubernetes e Datadog.
 * - GET /api/health        -> liveness  (a aplicação está viva?)
 * - GET /api/health/ready  -> readiness (a aplicação consegue falar com o banco?)
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness — a aplicação está no ar' })
  live() {
    return { status: 'ok', uptime: process.uptime() };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness — a aplicação consegue acessar o banco' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }
  }
}
