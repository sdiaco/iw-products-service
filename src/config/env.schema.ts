// Decorator metadata (used by class-validator/class-transformer) requires the
// Reflect polyfill to be loaded before any decorated class is defined.
import 'reflect-metadata';
import { Type, plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min, validateSync } from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvSchema {
  @IsEnum(NodeEnv) readonly NODE_ENV: NodeEnv = NodeEnv.Development;
  @Type(() => Number) @IsInt() @Min(1) @Max(65535) readonly PORT: number = 3000;
  @IsString() @IsNotEmpty() readonly DB_HOST!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(65535) readonly DB_PORT: number = 3306;
  @IsString() @IsNotEmpty() readonly DB_NAME!: string;
  @IsString() @IsNotEmpty() readonly DB_USER!: string;
  @IsString() @IsNotEmpty() readonly DB_PASSWORD!: string;
  // The concurrency test issues twenty parallel requests; a smaller pool would
  // serialise them and the race would never be exercised.
  @Type(() => Number) @IsInt() @Min(1) readonly DB_POOL_MAX: number = 25;
}

export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  const parsed = plainToInstance(EnvSchema, raw, { exposeDefaultValues: true });
  const errors = validateSync(parsed, { whitelist: true, forbidUnknownValues: false });
  if (errors.length > 0) {
    const detail = errors
      .map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment: ${detail}`);
  }
  return parsed;
}
