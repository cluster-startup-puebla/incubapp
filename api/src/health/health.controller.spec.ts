import { Reflector } from '@nestjs/core';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  it('returns ok for liveness without postgres', () => {
    const healthService = {
      liveness: () => ({ status: 'ok' as const }),
      readiness: () =>
        Promise.resolve({
          status: 'ok' as const,
          postgres: 'up' as const,
          redis: 'up' as const,
        }),
    } as unknown as HealthService;

    const controller = new HealthController(healthService);

    expect(controller.getHealth()).toEqual({ status: 'ok' });
  });

  it('returns ok when readiness checks pass', async () => {
    const healthService = {
      liveness: () => ({ status: 'ok' as const }),
      readiness: () =>
        Promise.resolve({
          status: 'ok' as const,
          postgres: 'up' as const,
          redis: 'up' as const,
        }),
    } as unknown as HealthService;

    const controller = new HealthController(healthService);

    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ok',
      postgres: 'up',
      redis: 'up',
    });
  });

  it('returns 503 when readiness fails', async () => {
    const healthService = {
      liveness: () => ({ status: 'ok' as const }),
      readiness: () =>
        Promise.reject(new ServiceUnavailableException({ status: 'error' })),
    } as unknown as HealthService;

    const controller = new HealthController(healthService);

    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('marks health routes as AllowAnonymous', () => {
    const reflector = new Reflector();

    expect(
      reflector.getAllAndOverride<boolean>('PUBLIC', [
        // eslint-disable-next-line @typescript-eslint/unbound-method -- reflector reads decorator metadata from the prototype method
        HealthController.prototype.getHealth,
        HealthController,
      ]),
    ).toBe(true);
    expect(
      reflector.getAllAndOverride<boolean>('PUBLIC', [
        // eslint-disable-next-line @typescript-eslint/unbound-method -- reflector reads decorator metadata from the prototype method
        HealthController.prototype.getReadiness,
        HealthController,
      ]),
    ).toBe(true);
  });
});
