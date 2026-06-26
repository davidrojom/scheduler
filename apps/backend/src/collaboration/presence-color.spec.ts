import { randomUUID } from 'crypto';
import { colorForUser } from './presence-color';

describe('colorForUser', () => {
  it('is deterministic for the same user id', () => {
    const id = randomUUID();
    expect(colorForUser(id)).toBe(colorForUser(id));
  });

  it('returns a hex color from the palette', () => {
    expect(colorForUser(randomUUID())).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('produces stable, distinct colors for fixed ids', () => {
    const a = '00000000-0000-0000-0000-000000000001';
    const b = '00000000-0000-0000-0000-000000000002';
    expect(colorForUser(a)).toBe(colorForUser(a));
    expect(colorForUser(b)).toBe(colorForUser(b));
    expect(colorForUser(a)).not.toBe(colorForUser(b));
  });
});
