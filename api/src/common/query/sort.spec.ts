import { BadRequestException } from '@nestjs/common';
import { parseSort, STARTUP_SORT_FIELDS } from './sort.js';

describe('parseSort', () => {
  it('desc y asc', () => {
    expect(parseSort('-createdAt,name', STARTUP_SORT_FIELDS)).toEqual([
      { createdAt: 'desc' },
      { name: 'asc' },
    ]);
  });

  it('fuera de lista', () => {
    expect(() => parseSort('password', STARTUP_SORT_FIELDS)).toThrow(
      BadRequestException,
    );
  });

  it('relacion arbitraria', () => {
    expect(() => parseSort('user.email', STARTUP_SORT_FIELDS)).toThrow(
      BadRequestException,
    );
  });

  it('default createdAt desc', () => {
    expect(parseSort(undefined, STARTUP_SORT_FIELDS)).toEqual([
      { createdAt: 'desc' },
    ]);
  });
});
