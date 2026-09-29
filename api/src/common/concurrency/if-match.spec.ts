import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { parseIfMatchVersion } from './if-match.js';

describe('parseIfMatchVersion', () => {
  it('version actual', () => {
    expect(parseIfMatchVersion('3')).toBe(3);
    expect(parseIfMatchVersion('"3"')).toBe(3);
  });

  it('sin header', () => {
    expect(() => parseIfMatchVersion(undefined)).toThrow(HttpException);
    try {
      parseIfMatchVersion(undefined);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.PRECONDITION_REQUIRED,
      );
    }
    expect(() => parseIfMatchVersion('')).toThrow(HttpException);
  });

  it('version invalida', () => {
    expect(() => parseIfMatchVersion('abc')).toThrow(BadRequestException);
    expect(() => parseIfMatchVersion('0')).toThrow(BadRequestException);
  });
});
