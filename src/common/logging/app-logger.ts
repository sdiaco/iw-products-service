import { Injectable, Logger } from '@nestjs/common';

/** One place to change if the logging backend ever changes. */
@Injectable()
export class AppLogger {
  private readonly logger = new Logger('app');

  info(message: string): void {
    this.logger.log(message);
  }

  warn(message: string): void {
    this.logger.warn(message);
  }

  error(message: string, stack?: string): void {
    this.logger.error(message, stack);
  }
}
