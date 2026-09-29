import { BadRequestException } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';
import {
  assertNoForbiddenWriteFields,
  FORBIDDEN_WRITE_FIELDS,
  nonEmptyString,
} from './zod-helpers.js';

const createStartupSchema = z
  .object({
    name: nonEmptyString,
    domain: nonEmptyString,
  })
  .strict();

assertNoForbiddenWriteFields(createStartupSchema);

class CreateStartupDto extends createZodDto(createStartupSchema) {}

const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  function bodyMeta(metatype: unknown) {
    return {
      type: 'body' as const,
      metatype: metatype as never,
      data: undefined,
    };
  }

  function queryMeta(metatype: unknown) {
    return {
      type: 'query' as const,
      metatype: metatype as never,
      data: undefined,
    };
  }

  it('payload valido', () => {
    const parsed = pipe.transform(
      { name: 'Acme', domain: 'acme.com' },
      bodyMeta(CreateStartupDto),
    );
    expect(parsed).toEqual({ name: 'Acme', domain: 'acme.com' });
  });

  it('campo extra', () => {
    expect(() =>
      pipe.transform(
        { name: 'Acme', domain: 'acme.com', extra: 1 },
        bodyMeta(CreateStartupDto),
      ),
    ).toThrow(BadRequestException);
  });

  it('tipo mal', () => {
    try {
      pipe.transform({ page: 'no' }, queryMeta(PaginationQueryDto));
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        errors: Array<{ path: string }>;
      };
      expect(response.errors.some((e) => e.path === 'page')).toBe(true);
    }
  });

  it('solo espacios', () => {
    expect(() =>
      pipe.transform(
        { name: '   ', domain: 'acme.com' },
        bodyMeta(CreateStartupDto),
      ),
    ).toThrow(BadRequestException);
  });

  it('body vacio', () => {
    expect(() => pipe.transform({}, bodyMeta(CreateStartupDto))).toThrow(
      BadRequestException,
    );
  });

  it('mass assignment', () => {
    for (const field of FORBIDDEN_WRITE_FIELDS) {
      expect(() =>
        pipe.transform(
          { name: 'Acme', domain: 'acme.com', [field]: 'injected' },
          bodyMeta(CreateStartupDto),
        ),
      ).toThrow(BadRequestException);
    }

    expect(() =>
      assertNoForbiddenWriteFields(createStartupSchema),
    ).not.toThrow();
  });
});
