import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import { SagaEventPattern, SagaEventPayload } from './saga-events.interface';

export type SagaEventHandler = (payload: any) => Promise<void>;

/**
 * Broker de eventos da Saga coreografada (RabbitMQ, exchange topic "oficina.saga").
 *
 * - Com RABBITMQ_URL definido: conecta ao RabbitMQ real, cria a fila durável do
 *   serviço, faz o bind das routing keys da Saga e consome as mensagens.
 *   Se o broker cair (ou ainda não estiver pronto no boot do pod), reconecta
 *   automaticamente a cada RABBITMQ_RECONNECT_MS (padrão 5s).
 * - Sem RABBITMQ_URL ou em NODE_ENV=test: modo in-memory, usado nos testes unitários/BDD.
 *
 * O consumo só começa em onApplicationBootstrap, depois que todos os serviços
 * registraram seus handlers em onModuleInit — assim nenhuma mensagem é
 * confirmada (ack) sem ter sido processada.
 */
@Injectable()
export class RabbitMQService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private readonly exchange = 'oficina.saga';
  private readonly queueName =
    process.env.RABBITMQ_QUEUE ?? 'os-service.saga.queue';
  private readonly reconnectDelayMs = Number(
    process.env.RABBITMQ_RECONNECT_MS ?? 5000,
  );
  private readonly handlers = new Map<string, SagaEventHandler[]>();
  private publishedEvents: Array<{ pattern: string; payload: any }> = [];
  private rabbitUrl: string | null = null;
  private bootstrapped = false;
  private consuming = false;
  private shuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  async onModuleInit() {
    const rabbitUrl = process.env.RABBITMQ_URL;
    if (!rabbitUrl || process.env.NODE_ENV === 'test') {
      this.logger.log(
        'RabbitMQ em modo local/in-memory (RABBITMQ_URL não definido ou ambiente de teste).',
      );
      return;
    }

    this.rabbitUrl = rabbitUrl;
    await this.connect();
  }

  async onApplicationBootstrap() {
    this.bootstrapped = true;
    await this.startConsuming();
  }

  isConnected(): boolean {
    return this.channel !== null;
  }

  getStatus(): 'connected' | 'disconnected' | 'in-memory' {
    if (!this.rabbitUrl) return 'in-memory';
    return this.isConnected() ? 'connected' : 'disconnected';
  }

  private async connect(): Promise<void> {
    if (!this.rabbitUrl || this.shuttingDown) return;

    try {
      const connection = await amqp.connect(this.rabbitUrl);
      connection.on('error', (err) =>
        this.logger.error(`Erro na conexão RabbitMQ: ${String(err)}`),
      );
      connection.on('close', () => this.handleConnectionLost());

      const channel = await connection.createChannel();
      await channel.assertExchange(this.exchange, 'topic', { durable: true });
      await channel.assertQueue(this.queueName, { durable: true });
      for (const pattern of Object.values(SagaEventPattern)) {
        await channel.bindQueue(this.queueName, this.exchange, pattern);
      }
      await channel.prefetch(10);

      this.connection = connection;
      this.channel = channel;
      this.consuming = false;
      this.logger.log(
        `Conectado ao RabbitMQ na exchange "${this.exchange}" e fila "${this.queueName}".`,
      );

      await this.startConsuming();
    } catch (error) {
      this.logger.warn(
        `Não foi possível conectar ao RabbitMQ (${String(error)}). Nova tentativa em ${this.reconnectDelayMs}ms.`,
      );
      this.scheduleReconnect();
    }
  }

  private handleConnectionLost() {
    this.connection = null;
    this.channel = null;
    this.consuming = false;
    if (this.shuttingDown) return;
    this.logger.warn('Conexão com o RabbitMQ encerrada. Reconectando...');
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.shuttingDown || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, this.reconnectDelayMs);
  }

  private async startConsuming() {
    const channel = this.channel;
    if (!channel || !this.bootstrapped || this.consuming) return;
    this.consuming = true;

    await channel.consume(this.queueName, (msg) => {
      if (!msg) return;
      void this.handleMessage(channel, msg);
    });
    this.logger.log(`Consumindo eventos da fila "${this.queueName}".`);
  }

  private async handleMessage(channel: amqp.Channel, msg: amqp.ConsumeMessage) {
    try {
      const content = JSON.parse(msg.content.toString());
      const routingKey = msg.fields.routingKey || content.event;
      this.logger.log(
        `[Saga Event Recebido] pattern=${routingKey} workOrderId=${content.workOrderId ?? 'N/A'}`,
      );
      await this.dispatchEvent(routingKey, content);
      channel.ack(msg);
    } catch (err) {
      this.logger.error(`Erro ao processar mensagem RabbitMQ: ${String(err)}`);
      channel.nack(msg, false, false);
    }
  }

  registerHandler(
    pattern: SagaEventPattern | string,
    handler: SagaEventHandler,
  ) {
    const existing = this.handlers.get(pattern) ?? [];
    existing.push(handler);
    this.handlers.set(pattern, existing);
  }

  async publish(
    pattern: SagaEventPattern | string,
    payload: SagaEventPayload | any,
  ): Promise<void> {
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
        this.logger.log(
          `[Saga Event Publicado] pattern=${pattern} workOrderId=${enrichedPayload.workOrderId ?? 'N/A'}`,
        );
        return;
      } catch (err) {
        this.logger.error(
          `Falha ao publicar no RabbitMQ (${pattern}): ${String(err)}`,
        );
      }
    }

    if (this.rabbitUrl) {
      this.logger.error(
        `RabbitMQ indisponível: evento ${pattern} (workOrderId=${enrichedPayload.workOrderId ?? 'N/A'}) não foi entregue ao broker.`,
      );
      return;
    }

    this.logger.log(
      `[Saga Event Emitido in-memory] pattern=${pattern} workOrderId=${enrichedPayload.workOrderId ?? 'N/A'}`,
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
    this.shuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // ignora erro ao fechar conexão
    }
  }
}
