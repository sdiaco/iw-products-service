import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Sequelize } from 'sequelize';
import { DatabaseUnavailableError } from '../common/errors/infrastructure.errors';
import { SEQUELIZE } from '../database/database.tokens';

@Controller('health')
export class HealthController {
  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  @Get()
  @ApiOperation({ summary: 'Liveness of the service and of its database' })
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.sequelize.query('SELECT 1');
    } catch {
      throw new DatabaseUnavailableError();
    }
    return { status: 'ok' };
  }
}
