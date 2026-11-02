import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getApiInfo() {
    return {
      name: 'Oficina Mecânica API',
      version: '1.0.0',
      docs: '/api-docs',
      status: 'ok',
    };
  }
}