import { UnprocessableEntityException } from '@nestjs/common';

/**
 * Stage (and milestone) sortOrder must be unique and contiguous from 1..n.
 * Gaps or duplicates → 422.
 */
export function assertContiguousSortOrders(
  orders: readonly number[],
  label = 'Stage',
): void {
  if (orders.length === 0) {
    return;
  }

  const seen = new Set<number>();
  for (const order of orders) {
    if (!Number.isInteger(order) || order < 1) {
      throw new UnprocessableEntityException(
        `${label} sortOrder must be a positive integer`,
      );
    }
    if (seen.has(order)) {
      throw new UnprocessableEntityException(
        `${label} sortOrder must be unique (duplicate ${order})`,
      );
    }
    seen.add(order);
  }

  const sorted = [...orders].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] !== i + 1) {
      throw new UnprocessableEntityException(
        `${label} sortOrder must be contiguous from 1 without gaps`,
      );
    }
  }
}
