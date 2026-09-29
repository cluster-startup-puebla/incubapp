import { overviewQuerySchema } from './analytics.dto.js';

describe('Analytics DTOs (T7.1)', () => {
  it('from/to son YYYY-MM-DD strings', () => {
    expect(
      overviewQuerySchema.parse({ from: '2026-01-01', to: '2026-01-31' }),
    ).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('from > to → error (400 via pipe)', () => {
    const result = overviewQuerySchema.safeParse({
      from: '2026-02-01',
      to: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza z.date / ISO datetime', () => {
    expect(
      overviewQuerySchema.safeParse({ from: '2026-01-01T00:00:00.000Z' })
        .success,
    ).toBe(false);
  });
});
