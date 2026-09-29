import { BadRequestException } from '@nestjs/common';
import { MAX_IN_VALUES, parseFilters, STARTUP_FILTERS } from './filter.js';

describe('parseFilters', () => {
  it('igualdad', () => {
    const where = parseFilters(
      { status: 'active' },
      { status: { type: 'string' } },
    );
    expect(where).toEqual({ status: 'active' });
  });

  it('combinado', () => {
    const where = parseFilters(
      {
        status: 'active',
        createdAt: { gte: '2026-01-01T00:00:00.000Z' },
      },
      {
        status: { type: 'string' },
        createdAt: { type: 'date', operators: ['gte', 'lte'] },
      },
    );
    expect(where).toEqual({
      status: 'active',
      createdAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
    });
    expect(where.createdAt).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('operador raro', () => {
    expect(() =>
      parseFilters(
        { name: { regex: 'x' } },
        { name: { type: 'string', operators: ['eq', 'in'] } },
      ),
    ).toThrow(BadRequestException);
  });

  it('fecha mala', () => {
    expect(() =>
      parseFilters(
        { createdAt: { gte: 'ayer' } },
        { createdAt: { type: 'date', operators: ['gte'] } },
      ),
    ).toThrow(BadRequestException);
  });

  it('in enorme', () => {
    const values = Array.from({ length: MAX_IN_VALUES + 1 }, (_, i) => `v${i}`);
    expect(() =>
      parseFilters(
        { name: { in: values.join(',') } },
        { name: { type: 'string', operators: ['in'] } },
      ),
    ).toThrow(BadRequestException);
  });

  it('inyeccion', () => {
    const injection = "x' OR 1=1";
    const where = parseFilters(
      { name: injection },
      { name: { type: 'string' } },
    );
    expect(where).toEqual({ name: injection });
    expect(typeof where.name).toBe('string');
    expect(JSON.stringify(where)).toContain(injection);
    // Value is a parameter on the Prisma where object, not SQL text.
    expect(where).not.toEqual(expect.any(String));
  });

  it('whitelist startups', () => {
    expect(parseFilters({ name: 'Acme' }, STARTUP_FILTERS)).toEqual({
      name: 'Acme',
    });
  });
});
