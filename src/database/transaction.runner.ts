import { Inject, Injectable } from '@nestjs/common';
import { Sequelize, type Transaction } from 'sequelize';
import { SEQUELIZE } from './database.tokens';

@Injectable()
export class TransactionRunner {
  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  async run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return this.sequelize.transaction(work);
  }
}
