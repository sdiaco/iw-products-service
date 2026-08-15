import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, Sequelize, type Transaction } from 'sequelize';
import { SEQUELIZE } from '../../database/database.tokens';

export interface IdempotencyRecord {
  readonly requestHash: string;
  readonly responseStatus: number | null;
  readonly responseBody: unknown;
}

@Injectable()
export class IdempotencyRepository {
  constructor(@Inject(SEQUELIZE) private readonly sequelize: Sequelize) {}

  async findFresh(
    key: string,
    hours: number,
    transaction: Transaction,
  ): Promise<IdempotencyRecord | null> {
    const rows = await this.sequelize.query<IdempotencyRecord>(
      `SELECT requestHash, responseStatus, responseBody
         FROM idempotency_keys
        WHERE idempotencyKey = :key
          AND createdAt > NOW(3) - INTERVAL :hours HOUR`,
      { replacements: { key, hours }, transaction, type: QueryTypes.SELECT },
    );
    return rows.length === 0 ? null : rows[0];
  }

  async insertPending(
    key: string,
    productToken: string,
    requestHash: string,
    transaction: Transaction,
  ): Promise<boolean> {
    const [, affected] = await this.sequelize.query(
      `INSERT INTO idempotency_keys (idempotencyKey, productId, requestHash, createdAt)
       SELECT :key, id, :requestHash, NOW(3) FROM products WHERE productToken = :productToken FOR UPDATE`,
      { replacements: { key, requestHash, productToken }, transaction, type: QueryTypes.INSERT },
    );
    return affected > 0;
  }

  async saveResponse(
    key: string,
    status: number,
    body: unknown,
    transaction: Transaction,
  ): Promise<void> {
    await this.sequelize.query(
      `UPDATE idempotency_keys
          SET responseStatus = :status, responseBody = :body
        WHERE idempotencyKey = :key`,
      {
        replacements: { key, status, body: JSON.stringify(body) },
        transaction,
        type: QueryTypes.UPDATE,
      },
    );
  }
}
