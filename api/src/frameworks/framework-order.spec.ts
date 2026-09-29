import { UnprocessableEntityException } from '@nestjs/common';
import { assertContiguousSortOrders } from './framework-order.js';

describe('assertContiguousSortOrders', () => {
  it('accepts empty', () => {
    expect(() => assertContiguousSortOrders([])).not.toThrow();
  });

  it('accepts 1..n', () => {
    expect(() => assertContiguousSortOrders([1, 2, 3])).not.toThrow();
    expect(() => assertContiguousSortOrders([3, 1, 2])).not.toThrow();
  });

  it('rejects duplicate', () => {
    expect(() => assertContiguousSortOrders([1, 1])).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects gap', () => {
    expect(() => assertContiguousSortOrders([1, 3])).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects zero or negative', () => {
    expect(() => assertContiguousSortOrders([0, 1])).toThrow(
      UnprocessableEntityException,
    );
  });
});
