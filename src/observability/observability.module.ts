import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from './metrics.service';
import { MetricsInterceptor } from './metrics.interceptor';

/**
 * Módulo global de observabilidade.
 * - Disponibiliza o MetricsService para injeção em qualquer lugar (ex.: WorkOrdersService).
 * - Registra o MetricsInterceptor como interceptor GLOBAL automaticamente
 *   (basta importar este módulo no AppModule).
 */
@Global()
@Module({
  providers: [
    MetricsService,
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
  exports: [MetricsService],
})
export class ObservabilityModule {}
