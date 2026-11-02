import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino'; // Import do módulo de Log
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ServicesModule } from './services/services.module';
import { InventoryModule } from './inventory/inventory.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { MessagingModule } from './messaging/messaging.module';
import { ObservabilityModule } from './observability/observability.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' } 
            : undefined, 
      },
    }),
    SharedModule,
    MessagingModule,
    AuthModule,
    CustomersModule,
    VehiclesModule,
    ServicesModule,
    InventoryModule,
    WorkOrdersModule,
    ObservabilityModule, // registra o MetricsService + interceptor global
    HealthModule,        // expõe /api/health e /api/health/ready
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {} // ⚠️ A PALAVRA "export" AQUI É O QUE RESOLVE O SEU ERRO!