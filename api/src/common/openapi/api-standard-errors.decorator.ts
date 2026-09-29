import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

/** Required error responses on every /api/v1 operation (T4.14). */
export function ApiStandardErrors() {
  return applyDecorators(
    ApiBadRequestResponse({ description: 'Bad request (validation)' }),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
    ApiForbiddenResponse({ description: 'Forbidden' }),
    ApiNotFoundResponse({ description: 'Not found' }),
    ApiTooManyRequestsResponse({ description: 'Too many requests' }),
  );
}

export const REQUIRED_ERROR_STATUSES = [
  '400',
  '401',
  '403',
  '404',
  '429',
] as const;
