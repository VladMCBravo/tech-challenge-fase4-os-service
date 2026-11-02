import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = moduleRef.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return API info', () => {
      expect(appController.getApiInfo()).toEqual({
        name: 'Oficina Mecânica API',
        version: '1.0.0',
        docs: '/api-docs',
        status: 'ok',
      });
    });
  });
});