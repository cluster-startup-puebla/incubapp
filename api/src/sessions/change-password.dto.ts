import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nonEmptyString } from '../common/validation/zod-helpers.js';

export const changePasswordSchema = z
  .object({
    currentPassword: nonEmptyString,
    newPassword: nonEmptyString.min(10),
  })
  .strict();

export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
