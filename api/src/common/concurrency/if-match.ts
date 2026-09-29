import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Parses If-Match into a positive integer version.
 * Missing/empty → 428. Non-integer → 400.
 */
export function parseIfMatchVersion(
  header: string | string[] | undefined,
): number {
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw === undefined || raw.trim() === '') {
    throw new HttpException(
      'If-Match header is required',
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }

  const unquoted = raw.trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
  const version = Number(unquoted);
  if (!Number.isInteger(version) || version < 1) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [
        {
          path: 'If-Match',
          message: 'must be a positive integer version',
        },
      ],
    });
  }
  return version;
}
