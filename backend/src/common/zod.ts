import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';

/** Swagger body docs generated from the zod schema that validates it. */
export function ApiZodBody(schema: z.ZodType): MethodDecorator {
  return ApiBody({
    schema: z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>,
  });
}

/** Swagger query docs for each key of a zod object schema. */
export function ApiZodQuery(schema: z.ZodObject): MethodDecorator {
  const decorators = Object.keys(schema.shape).map((name) =>
    ApiQuery({ name, required: false, type: String }),
  );
  return (target, key, descriptor) => {
    for (const d of decorators) d(target, key, descriptor);
  };
}

export const accountIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(
    /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/,
    'Invalid NEAR account id',
  );

export const uuidSchema = z.uuid();
