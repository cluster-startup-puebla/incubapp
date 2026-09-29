import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

type ZodDtoType = {
  isZodDto: true;
  schema: ZodType;
};

function isZodDto(metatype: unknown): metatype is ZodDtoType {
  if (typeof metatype !== 'function') {
    return false;
  }
  const candidate = metatype as unknown as {
    isZodDto?: boolean;
    schema?: ZodType | null;
  };
  return candidate.isZodDto === true && candidate.schema != null;
}

export type FieldError = {
  path: string;
  message: string;
};

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!isZodDto(metadata.metatype)) {
      return value;
    }

    const result = metadata.metatype.schema.safeParse(
      value === undefined ? {} : value,
    );

    if (!result.success) {
      const errors: FieldError[] = result.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.map(String).join('.') : '',
        message: issue.message,
      }));

      throw new BadRequestException({
        message: 'Validation failed',
        errors,
      });
    }

    return result.data;
  }
}
