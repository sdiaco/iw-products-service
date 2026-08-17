import { Inject, Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize';
import { SEQUELIZE } from './database.tokens';

/**
 * Exists so the health controller can ask "is the database answering?" without
 * importing the ORM. The layer that owns the connection owns the question.
 */
@Injectable()
export class DatabaseHealth {
  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  async isReachable(): Promise<boolean> {
    try {
      await this.sequelize.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
