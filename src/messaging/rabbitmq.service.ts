import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SagaEventPattern, SagaEventPayload } from './saga-events.interface';

export type SagaEventHandler = (payload: any) => Promise<void>;

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: any = null;
  private channel: any = null;
  private readonly exchange = 'oficina.saga';
  private readonly queueName = process.env.RABBITMQ_QUEUE ?? 'os-service.saga.queue';
  private readonly handlers = new Map<string, SagaEventHandler[]>();
  private publishedEvents: Array<{ pattern: string; payload: any }> = [];

  async onModuleInit() {
    const rabbitUrl = process.env.RABBITMQ_URL;
    if (!rabbitUrl || process.env.NODE_ENV === 'test') {
      this.logger.log(
        'RabbitMQ em modo local/in-memory (RABBITMQ_URL não definido ou ambiente de teste).',
      );
      return;
    }

    await this.connectWithRetry(rabbitUrl);
  }

  private async connectWithRetry(rabbitUrl: string) {
    try {
      // Carregamento dinâmico para suportar execução com ou sem container ativo
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const amqp = require('amqplib');
      this.connection = await amqp.connect(rabbitUrl);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(this.exchange, 'topic', {
        durable: true,
      });
      const q = await this.channel.assertQueue(this.queueName, {
        durable: true,
      });

      for (const pattern of Object.values(SagaEventPattern)) {
        await this.channel.bindQueue(q.queue, this.exchange, pattern);
      }

      await this.channel.consume(q.queue, async (msg: any) => {
        if (!msg) return;
        try {
          const content = JSON.parse(msg.content.toString());
          const routingKey = msg.fields.routingKey || content.event;
          await this.dispatchEvent(routingKey, content);
          this.channel.ack(msg);
        } catch (err) {
          this.logger.error(
            `Erro ao processar mensagem RabbitMQ: ${String(err)}`,
          );
          this.channel.nack(msg, false, false);
        }
      });

      this.logger.log(
        `Conectado ao RabbitMQ na exchange "${this.exchange}" e fila "${this.queueName}".`,
      );
    } catch (error) {
      this.logger.warn(
        `Não foi possível conectar ao RabbitMQ (${String(error)}). Operando com fallback resiliente.`,
      );
    }
  }

  registerHandler(pattern: SagaEventPattern | string, handler: SagaEventHandler) {
    const existing = this.handlers.get(pattern) ?? [];
    existing.push(handler);
    this.handlers.set(pattern, existing);
  }

  async publish(pattern: SagaEventPattern | string, payload: SagaEventPayload | any): Promise<void> {
    const enrichedPayload = {
      ...payload,
      event: pattern,
      timestamp: payload?.timestamp ?? new Date().toISOString(),
    };

    this.publishedEvents.push({ pattern, payload: enrichedPayload });

    if (this.channel) {
      try {
        this.channel.publish(
          this.exchange,
          pattern,
          Buffer.from(JSON.stringify(enrichedPayload)),
          { persistent: true, contentType: 'application/json' },
        );
        this.logger.log(`Evento publicado no RabbitMQ: ${pattern}`);
        return;
      } catch (err) {
        this.logger.error(`Falha ao publicar no RabbitMQ (${pattern}): ${String(err)}`);
      }
    }

    this.logger.log(
      `[Saga Event Emitido] pattern=${pattern} workOrderId=${enrichedPayload.workOrderId ?? 'N/A'}`,
    );
  }

  async dispatchEvent(pattern: string, payload: any): Promise<void> {
    const patternHandlers = this.handlers.get(pattern) ?? [];
    for (const handler of patternHandlers) {
      await handler(payload);
    }
  }

  getPublishedEvents() {
    return [...this.publishedEvents];
  }

  clearPublishedEvents() {
    this.publishedEvents = [];
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // ignora erro ao fechar conexão
    }
  }
}
