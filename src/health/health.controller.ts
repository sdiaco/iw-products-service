import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { DatabaseUnavailableError } from '../common/errors/infrastructure.errors';
import { DatabaseHealth } from '../database/database.health';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseHealth) {}

  @Get()
  @ApiOperation({ summary: 'Liveness of the service and of its database' })
  async check(): Promise<{ status: 'ok' }> {
    if (!(await this.database.isReachable())) {
      throw new DatabaseUnavailableError();
    }
    return { status: 'ok' };
  }
}
