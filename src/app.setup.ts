import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DomainExceptionFilter } from './common/errors/domain-exception.filter';
import { ValidationFailedError } from './common/errors/validation-failed.error';
import { AppLogger } from './common/logging/app-logger';

/** Shared by main.ts and the e2e factory so the two cannot drift apart. */
export function configureApp(app: NestFastifyApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => new ValidationFailedError(errors),
    }),
  );
  app.useGlobalFilters(new DomainExceptionFilter(app.get(AppLogger)));
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Products Service').setVersion('1.0.0').build(),
  );
  SwaggerModule.setup('docs', app, document);
}
