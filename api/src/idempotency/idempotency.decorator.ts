import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENCY_ENABLED_KEY = 'idempotency:enabled';

/** Opt a handler/controller into Idempotency-Key handling. */
export function RequireIdempotency() {
  return SetMetadata(IDEMPOTENCY_ENABLED_KEY, true);
}
