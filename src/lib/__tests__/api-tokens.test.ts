import { API_TOKEN_TTL_DAYS, apiTokenExpiresAt, isApiTokenExpired } from '../api-tokens';

describe('API token expiry', () => {
  const created = '2026-10-09T12:00:00.000Z';

  it(`expires ${API_TOKEN_TTL_DAYS} days after creation`, () => {
    expect(apiTokenExpiresAt(created).toISOString()).toBe('2027-01-07T12:00:00.000Z');
  });

  it('is valid until the expiry instant, then expired', () => {
    expect(isApiTokenExpired(created, new Date('2026-10-09T12:00:01Z'))).toBe(false);
    expect(isApiTokenExpired(created, new Date('2027-01-07T11:59:59Z'))).toBe(false);
    expect(isApiTokenExpired(created, new Date('2027-01-07T12:00:00Z'))).toBe(true);
  });

  it('treats an unreadable creation time as expired', () => {
    expect(isApiTokenExpired('not a date', new Date('2026-10-09T12:00:00Z'))).toBe(true);
  });
});
