import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Config } from '../config/config.js';
import { ForaDaDemoGuard, SoNaDemoGuard } from './guards.js';

const com = (demo: boolean) => ({ CADENCE_DEMO: demo }) as Config;

describe('guards da demonstração', () => {
  it('SoNaDemoGuard: 404 fora da demonstração, passa dentro', () => {
    expect(() => new SoNaDemoGuard(com(false)).canActivate()).toThrow(
      NotFoundException,
    );
    expect(new SoNaDemoGuard(com(true)).canActivate()).toBe(true);
  });

  it('ForaDaDemoGuard: 403 na demonstração, passa fora', () => {
    expect(() => new ForaDaDemoGuard(com(true)).canActivate()).toThrow(
      ForbiddenException,
    );
    expect(new ForaDaDemoGuard(com(false)).canActivate()).toBe(true);
  });
});
