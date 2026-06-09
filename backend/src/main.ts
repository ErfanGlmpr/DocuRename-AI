import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(cookieParser());

  const corsOrigin = process.env.CORS_ORIGIN;
  if (corsOrigin) {
    const origins = corsOrigin.split(',').map((o) => o.trim());
    app.enableCors({
      origin: origins.length === 1 ? origins[0] : origins,
      credentials: true,
    });
  } else {
    app.enableCors({
      credentials: true,
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // SSE requires keep-alive connections to stay open.
  // Set a generous keepAliveTimeout so Node's HTTP server doesn't
  // close the connection before the client sees all events.
  const httpAdapter = app.getHttpAdapter();
  const httpServer = httpAdapter.getHttpServer() as import('http').Server;
  httpServer.keepAliveTimeout = 60_000; // 60 s
  httpServer.headersTimeout = 65_000; // must be > keepAliveTimeout

  const config = new DocumentBuilder()
    .setTitle('PDF AI Renamer API')
    .setDescription(
      'The API for managing and processing PDF documents using AI. ' +
        'Phase 5: Authentication, multi-tenant isolation.',
    )
    .setVersion('5.0')
    .addTag('auth')
    .addTag('documents')
    .addTag('events')
    .addTag('health')
    .addTag('observability')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((err: Error) => {
  console.error('Failed to start application', err.message);
});
