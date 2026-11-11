import { EventEmitter } from 'events';
import * as amqp from 'amqplib';
import { RabbitMQService } from './rabbitmq.service';
import { SagaEventPattern } from './saga-events.interface';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

const connectMock = amqp.connect as unknown as jest.Mock;

function buildBroker() {
  let consumer: ((msg: any) => void) | null = null;
  const channel = {
    assertExchange: jest.fn().mockResolvedValue(undefined),
    assertQueue: jest.fn().mockResolvedValue({ queue: 'q' }),
    bindQueue: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockImplementation((_q: string, cb: any) => {
      consumer = cb;
      return Promise.resolve({ consumerTag: 'tag' });
    }),
    publish: jest.fn().mockReturnValue(true),
    ack: jest.fn(),
    nack: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const connection = Object.assign(new EventEmitter(), {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
  });
  return {
    channel,
    connection,
    deliver: (msg: any) => consumer?.(msg),
  };
}

const message = (routingKey: string, body: unknown) => ({
  content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  fields: { routingKey },
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('RabbitMQService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    connectMock.mockReset();
    jest.useRealTimers();
  });

  describe('modo in-memory', () => {
    it('não conecta ao broker sem RABBITMQ_URL e registra eventos publicados', async () => {
      delete process.env.RABBITMQ_URL;
      const service = new RabbitMQService();
      await service.onModuleInit();
      await service.onApplicationBootstrap();

      await service.publish(SagaEventPattern.PAYMENT_APPROVED, {
        workOrderId: 'wo-1',
      });

      expect(connectMock).not.toHaveBeenCalled();
      expect(service.getStatus()).toBe('in-memory');
      expect(service.isConnected()).toBe(false);
      expect(service.getPublishedEvents()).toHaveLength(1);
      expect(service.getPublishedEvents()[0].payload.event).toBe(
        SagaEventPattern.PAYMENT_APPROVED,
      );
      service.clearPublishedEvents();
      expect(service.getPublishedEvents()).toHaveLength(0);
      await service.onModuleDestroy();
    });

    it('despacha eventos para todos os handlers registrados', async () => {
      const service = new RabbitMQService();
      const h1 = jest.fn().mockResolvedValue(undefined);
      const h2 = jest.fn().mockResolvedValue(undefined);
      service.registerHandler(SagaEventPattern.PAYMENT_FAILED, h1);
      service.registerHandler(SagaEventPattern.PAYMENT_FAILED, h2);

      await service.dispatchEvent(SagaEventPattern.PAYMENT_FAILED, { a: 1 });
      await service.dispatchEvent('evento.sem.handler', {});

      expect(h1).toHaveBeenCalledWith({ a: 1 });
      expect(h2).toHaveBeenCalledWith({ a: 1 });
    });
  });

  describe('com RabbitMQ real', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      process.env.RABBITMQ_URL = 'amqp://guest:guest@rabbitmq:5672';
      process.env.RABBITMQ_RECONNECT_MS = '10';
    });

    it('cria exchange/fila, faz bind das routing keys e só consome após o bootstrap', async () => {
      const broker = buildBroker();
      connectMock.mockResolvedValue(broker.connection);
      const service = new RabbitMQService();

      await service.onModuleInit();

      expect(broker.channel.assertExchange).toHaveBeenCalledWith(
        'oficina.saga',
        'topic',
        { durable: true },
      );
      expect(broker.channel.bindQueue).toHaveBeenCalledTimes(
        Object.values(SagaEventPattern).length,
      );
      expect(broker.channel.consume).not.toHaveBeenCalled();
      expect(service.getStatus()).toBe('connected');

      await service.onApplicationBootstrap();
      await service.onApplicationBootstrap();
      expect(broker.channel.consume).toHaveBeenCalledTimes(1);

      await service.onModuleDestroy();
      expect(broker.channel.close).toHaveBeenCalled();
      expect(broker.connection.close).toHaveBeenCalled();
    });

    it('processa a mensagem no handler e confirma (ack)', async () => {
      const broker = buildBroker();
      connectMock.mockResolvedValue(broker.connection);
      const service = new RabbitMQService();
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler(SagaEventPattern.EXECUTION_FINISHED, handler);

      await service.onModuleInit();
      await service.onApplicationBootstrap();

      const msg = message(SagaEventPattern.EXECUTION_FINISHED, {
        workOrderId: 'wo-9',
      });
      broker.deliver(msg);
      broker.deliver(null);
      await flush();

      expect(handler).toHaveBeenCalledWith({ workOrderId: 'wo-9' });
      expect(broker.channel.ack).toHaveBeenCalledWith(msg);
      await service.onModuleDestroy();
    });

    it('rejeita (nack) mensagens inválidas ou cujo handler falha', async () => {
      const broker = buildBroker();
      connectMock.mockResolvedValue(broker.connection);
      const service = new RabbitMQService();
      service.registerHandler(SagaEventPattern.PAYMENT_APPROVED, () =>
        Promise.reject(new Error('boom')),
      );

      await service.onModuleInit();
      await service.onApplicationBootstrap();

      const invalid = message('qualquer', '{json-invalido');
      const failing = message(SagaEventPattern.PAYMENT_APPROVED, {});
      broker.deliver(invalid);
      broker.deliver(failing);
      await flush();

      expect(broker.channel.nack).toHaveBeenCalledWith(invalid, false, false);
      expect(broker.channel.nack).toHaveBeenCalledWith(failing, false, false);
      await service.onModuleDestroy();
    });

    it('publica eventos persistentes na exchange da Saga', async () => {
      const broker = buildBroker();
      connectMock.mockResolvedValue(broker.connection);
      const service = new RabbitMQService();
      await service.onModuleInit();

      await service.publish(SagaEventPattern.OS_BUDGET_REQUESTED, {
        workOrderId: 'wo-2',
        timestamp: '2026-01-01T00:00:00.000Z',
      });

      const [exchange, pattern, body, options] =
        broker.channel.publish.mock.calls[0];
      expect(exchange).toBe('oficina.saga');
      expect(pattern).toBe(SagaEventPattern.OS_BUDGET_REQUESTED);
      expect(JSON.parse(body.toString())).toEqual({
        workOrderId: 'wo-2',
        event: SagaEventPattern.OS_BUDGET_REQUESTED,
        timestamp: '2026-01-01T00:00:00.000Z',
      });
      expect(options).toEqual({
        persistent: true,
        contentType: 'application/json',
      });
      await service.onModuleDestroy();
    });

    it('registra erro quando a publicação no canal falha', async () => {
      const broker = buildBroker();
      broker.channel.publish.mockImplementation(() => {
        throw new Error('channel closed');
      });
      connectMock.mockResolvedValue(broker.connection);
      const service = new RabbitMQService();
      await service.onModuleInit();

      await expect(
        service.publish(SagaEventPattern.PAYMENT_FAILED, { workOrderId: 'x' }),
      ).resolves.toBeUndefined();
      expect(service.getPublishedEvents()).toHaveLength(1);
      await service.onModuleDestroy();
    });

    it('reconecta automaticamente quando o broker ainda não está disponível', async () => {
      const broker = buildBroker();
      connectMock
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue(broker.connection);
      const service = new RabbitMQService();

      await service.onModuleInit();
      await service.onApplicationBootstrap();
      expect(service.getStatus()).toBe('disconnected');

      await service.publish(SagaEventPattern.PAYMENT_APPROVED, {});
      expect(broker.channel.publish).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 30));
      await flush();

      expect(connectMock).toHaveBeenCalledTimes(2);
      expect(service.getStatus()).toBe('connected');
      expect(broker.channel.consume).toHaveBeenCalledTimes(1);
      await service.onModuleDestroy();
    });

    it('reconecta quando a conexão é encerrada e para ao desligar', async () => {
      const first = buildBroker();
      const second = buildBroker();
      connectMock
        .mockResolvedValueOnce(first.connection)
        .mockResolvedValueOnce(second.connection);
      const service = new RabbitMQService();
      await service.onModuleInit();
      await service.onApplicationBootstrap();

      first.connection.emit('error', new Error('socket'));
      first.connection.emit('close');
      expect(service.isConnected()).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 30));
      await flush();
      expect(service.isConnected()).toBe(true);
      expect(second.channel.consume).toHaveBeenCalledTimes(1);

      await service.onModuleDestroy();
      second.connection.emit('close');
      expect(connectMock).toHaveBeenCalledTimes(2);
    });

    it('cancela a reconexão pendente ao desligar', async () => {
      connectMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new RabbitMQService();
      await service.onModuleInit();
      await service.onModuleDestroy();

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(connectMock).toHaveBeenCalledTimes(1);
    });
  });
});
