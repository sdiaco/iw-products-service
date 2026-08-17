import { Global, Module } from '@nestjs/common';
import { EnvSchema, validateEnv } from './env.schema';

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): EnvSchema => validateEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
