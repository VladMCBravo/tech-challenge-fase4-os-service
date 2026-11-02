import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Interceptor global: emite, para CADA requisição HTTP:
 *  - oficina.api.requests   (contagem, tags: method, route, status_class)
 *  - oficina.api.latency    (distribuição em ms, tags: method, route)
 *  - oficina.errors         (contagem, quando status >= 500)
 *
 * Assim, latência das APIs e erros/falhas viram métricas customizadas
 * que controlamos e que alimentam os dashboards — sem tocar nas regras de negócio.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const start = Date.now();
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method;
    // usa o padrão da rota (ex.: /api/work-orders/:id) para não explodir cardinalidade
    const route =
      (req as unknown as { route?: { path?: string } }).route?.path ||
      req.path ||
      'unknown';

    const emit = (statusCode: number) => {
      const ms = Date.now() - start;
      const statusClass = `${Math.floor(statusCode / 100)}xx`;
      const baseTags = [`method:${method}`, `route:${route}`];
      this.metrics.increment('oficina.api.requests', [
        ...baseTags,
        `status_class:${statusClass}`,
      ]);
      this.metrics.distribution('oficina.api.latency', ms, baseTags);
      if (statusCode >= 500) {
        this.metrics.integrationError('http_5xx');
      }
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          emit(res.statusCode ?? 200);
        },
        error: (err: { status?: number }) => {
          emit(err?.status ?? 500);
        },
      }),
    );
  }
}
