import { Global, Module } from '@nestjs/common';
import { sequelizeProvider } from './database.providers';
import { SEQUELIZE } from './database.tokens';

@Global()
@Module({ providers: [sequelizeProvider], exports: [SEQUELIZE] })
export class DatabaseModule {}
