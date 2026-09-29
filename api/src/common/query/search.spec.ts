import { BadRequestException } from '@nestjs/common';
import { buildSearchWhere, escapeLikeWildcards, mergeWhere } from './search.js';

describe('search', () => {
  it('parcial', () => {
    expect(buildSearchWhere('inc', ['name'])).toEqual({
      OR: [{ name: { contains: 'inc', mode: 'insensitive' } }],
    });
  });

  it('vacio', () => {
    expect(buildSearchWhere('', ['name'])).toEqual({});
    expect(buildSearchWhere('   ', ['name'])).toEqual({});
    expect(buildSearchWhere(undefined, ['name'])).toEqual({});
  });

  it('un caracter', () => {
    expect(() => buildSearchWhere('a', ['name'])).toThrow(BadRequestException);
  });

  it('comodin', () => {
    expect(escapeLikeWildcards('%')).toBe('\\%');
    expect(escapeLikeWildcards('_')).toBe('\\_');
    expect(buildSearchWhere('%x', ['name'])).toEqual({
      OR: [{ name: { contains: '\\%x', mode: 'insensitive' } }],
    });
  });

  it('merge con filtro', () => {
    const where = mergeWhere(
      { countryCode: 'MX' },
      buildSearchWhere('tec', ['name']),
    );
    expect(where).toEqual({
      AND: [
        { countryCode: 'MX' },
        { OR: [{ name: { contains: 'tec', mode: 'insensitive' } }] },
      ],
    });
  });
});
