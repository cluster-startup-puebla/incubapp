import {
  Controller,
  Get,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { GeoUnitsController } from '../geo-units/geo-units.controller.js';
import { HealthController } from '../health/health.controller.js';
import { FrameworksController } from '../frameworks/frameworks.controller.js';
import { IncubatorsController } from '../incubators/incubators.controller.js';
import { InstitutionsController } from '../institutions/institutions.controller.js';
import { IncubationsController } from '../incubations/incubations.controller.js';
import { MembershipsController } from '../membership/memberships.controller.js';
import { MetricReadingsController } from '../metric-readings/metric-readings.controller.js';
import { NotificationsController } from '../notifications/notifications.controller.js';
import { AnalyticsController } from '../analytics/analytics.controller.js';
import { SessionsController } from '../sessions/sessions.controller.js';
import { StartupsController } from '../startups/startups.controller.js';
import { UsersController } from '../users/users.controller.js';

@AllowAnonymous()
@Controller('fixture-public')
class FixturePublicController {
  @Get()
  ok() {
    return { ok: true };
  }
}

@Controller('fixture-protected')
class FixtureProtectedController {
  @Get()
  ok() {
    return { ok: true };
  }
}

type ControllerType = new (...args: never[]) => unknown;

/**
 * Every Nest controller in api/src must appear here.
 * Missing decorator ⇒ protected (deny-by-default), never public by accident.
 */
const CONTROLLER_INVENTORY: Array<{
  name: string;
  type: ControllerType;
  anonymous: boolean;
}> = [
  { name: 'HealthController', type: HealthController, anonymous: true },
  { name: 'SessionsController', type: SessionsController, anonymous: false },
  { name: 'StartupsController', type: StartupsController, anonymous: false },
  {
    name: 'InstitutionsController',
    type: InstitutionsController,
    anonymous: false,
  },
  {
    name: 'IncubationsController',
    type: IncubationsController,
    anonymous: false,
  },
  {
    name: 'MetricReadingsController',
    type: MetricReadingsController,
    anonymous: false,
  },
  {
    name: 'NotificationsController',
    type: NotificationsController,
    anonymous: false,
  },
  {
    name: 'AnalyticsController',
    type: AnalyticsController,
    anonymous: false,
  },
  {
    name: 'IncubatorsController',
    type: IncubatorsController,
    anonymous: false,
  },
  {
    name: 'FrameworksController',
    type: FrameworksController,
    anonymous: false,
  },
  {
    name: 'GeoUnitsController',
    type: GeoUnitsController,
    anonymous: false,
  },
  {
    name: 'MembershipsController',
    type: MembershipsController,
    anonymous: false,
  },
  {
    name: 'UsersController',
    type: UsersController,
    anonymous: false,
  },
];

function hasAllowAnonymous(
  reflector: Reflector,
  controller: ControllerType,
): boolean {
  return reflector.getAllAndOverride<boolean>('PUBLIC', [controller]) === true;
}

describe('public routes inventory', () => {
  it('health anonimo', () => {
    const reflector = new Reflector();
    expect(hasAllowAnonymous(reflector, HealthController)).toBe(true);
  });

  it('controller nuevo sin decorator', () => {
    const reflector = new Reflector();
    expect(hasAllowAnonymous(reflector, FixtureProtectedController)).toBe(
      false,
    );
    expect(hasAllowAnonymous(reflector, FixturePublicController)).toBe(true);
  });

  it('inventario: solo health es anonimo', () => {
    const reflector = new Reflector();
    for (const entry of CONTROLLER_INVENTORY) {
      expect(hasAllowAnonymous(reflector, entry.type)).toBe(entry.anonymous);
    }
    const anonymous = CONTROLLER_INVENTORY.filter((entry) => entry.anonymous);
    expect(anonymous.map((entry) => entry.name)).toEqual(['HealthController']);
  });
});

describe('AuthGuard deny-by-default', () => {
  function createContext(
    request: Record<string, unknown>,
    handler: () => { ok: boolean } = () => ({ ok: true }),
    controller: new (...args: never[]) => unknown = FixtureProtectedController,
  ): ExecutionContext {
    return {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('cookie ausente', async () => {
    const reflector = new Reflector();
    const guard = new AuthGuard(reflector, {
      auth: { api: { getSession: () => Promise.resolve(null) } },
    } as never);

    await expect(
      guard.canActivate(createContext({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('cookie expirada', async () => {
    const reflector = new Reflector();
    const guard = new AuthGuard(reflector, {
      auth: { api: { getSession: () => Promise.resolve(null) } },
    } as never);

    await expect(
      guard.canActivate(
        createContext({
          headers: { cookie: 'better-auth.session_token=expired' },
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('isSuperAdmin false no es ban', async () => {
    const reflector = new Reflector();
    const guard = new AuthGuard(reflector, {
      auth: {
        api: {
          getSession: () =>
            Promise.resolve({
              user: {
                id: 'user-1',
                email: 'user@example.com',
                isSuperAdmin: false,
              },
              session: {
                id: 'sess-1',
                userId: 'user-1',
                expiresAt: new Date(Date.now() + 60_000),
              },
            }),
        },
      },
    } as never);

    await expect(
      guard.canActivate(createContext({ headers: {} })),
    ).resolves.toBe(true);
  });
});
