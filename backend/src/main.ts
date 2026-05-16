import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('PDF AI Renamer API')
    .setDescription(
      'The API for managing and processing PDF documents using AI',
    )
    .setVersion('1.0')
    .addTag('documents')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err: Error) => {
  console.error('Failed to start application', err.message);
});
