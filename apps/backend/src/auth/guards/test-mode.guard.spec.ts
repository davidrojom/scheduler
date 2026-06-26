import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TestModeGuard } from './test-mode.guard';

function makeGuard(authTestMode: unknown): TestModeGuard {
  const config = {
    get: (key: string) => (key === 'AUTH_TEST_MODE' ? authTestMode : undefined),
  } as unknown as ConfigService;
  return new TestModeGuard(config);
}

describe('TestModeGuard', () => {
  it('allows the request when AUTH_TEST_MODE === "true"', () => {
    expect(makeGuard('true').canActivate()).toBe(true);
  });

  it('throws NotFoundException when AUTH_TEST_MODE is "false"', () => {
    expect(() => makeGuard('false').canActivate()).toThrow(NotFoundException);
  });

  it('throws NotFoundException when AUTH_TEST_MODE is unset', () => {
    expect(() => makeGuard(undefined).canActivate()).toThrow(NotFoundException);
  });

  it('throws NotFoundException for a truthy-but-not-"true" value', () => {
    expect(() => makeGuard('1').canActivate()).toThrow(NotFoundException);
  });
});
