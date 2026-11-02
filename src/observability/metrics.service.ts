import { Injectable, Logger } from '@nestjs/common';
import tracer from '../tracer';

/**
 * Emite métricas customizadas para o Datadog via DogStatsD do dd-trace
 * (não precisa de dependência nova — usa o tracer já inicializado).
 *
 * O envio vai para o Datadog Agent em DD_AGENT_HOST:8125.
 * Todas as chamadas são "à prova de falha": se o DogStatsD não estiver
 * disponível, apenas logamos em debug e seguimos — métrica nunca quebra a API.
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  private get dogstatsd(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (tracer as any)?.dogstatsd;
  }

  increment(metric: string, tags: string[] = [], value = 1): void {
    try {
      this.dogstatsd?.increment(metric, value, tags);
    } catch (e) {
      this.logger.debug(`Falha ao emitir métrica ${metric}: ${String(e)}`);
    }
  }

  gauge(metric: string, value: number, tags: string[] = []): void {
    try {
      this.dogstatsd?.gauge(metric, value, tags);
    } catch (e) {
      this.logger.debug(`Falha ao emitir gauge ${metric}: ${String(e)}`);
    }
  }

  /** Distribuição (ideal para latências/durações — permite p50/p95/avg no Datadog). */
  distribution(metric: string, value: number, tags: string[] = []): void {
    try {
      this.dogstatsd?.distribution(metric, value, tags);
    } catch (e) {
      this.logger.debug(`Falha ao emitir distribution ${metric}: ${String(e)}`);
    }
  }

  // ---- Métricas de negócio (Ordens de Serviço) ----

  /** Uma OS foi criada → alimenta o "volume diário de OS". */
  workOrderCreated(): void {
    this.increment('oficina.work_orders.created');
  }

  /** Mudança de status da OS → contagem por status. */
  workOrderStatusChanged(status: string): void {
    this.increment('oficina.work_orders.status_change', [`status:${status}`]);
  }

  /**
   * Duração (em segundos) de uma etapa da OS.
   * stage: "diagnostico" | "execucao" | "finalizacao"
   */
  workOrderStageDuration(stage: string, seconds: number): void {
    if (seconds >= 0 && Number.isFinite(seconds)) {
      this.distribution('oficina.work_orders.stage_duration', seconds, [
        `stage:${stage}`,
      ]);
    }
  }

  /** Falha em processamento/integração (ex.: erro 5xx, falha ao gerar orçamento). */
  integrationError(type: string): void {
    this.increment('oficina.errors', [`type:${type}`]);
  }
}
