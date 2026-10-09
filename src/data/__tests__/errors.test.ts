import { isRetryable } from '../errors';

describe('isRetryable', () => {
  it('retries network failures (no error code)', () => {
    expect(isRetryable({ error: { code: '' }, status: 0 })).toBe(true);
    expect(isRetryable({ error: {} })).toBe(true);
  });
  it('retries expired sessions and server errors', () => {
    expect(isRetryable({ error: { code: 'PGRST301' }, status: 401 })).toBe(true);
    expect(isRetryable({ error: { code: 'PGRST303' }, status: 401 })).toBe(true);
    expect(isRetryable({ error: { code: 'XX000' }, status: 503 })).toBe(true);
  });
  it('drops permanent rejections', () => {
    expect(isRetryable({ error: { code: '23514' }, status: 400 })).toBe(false);
    expect(isRetryable({ error: { code: '42501' }, status: 403 })).toBe(false);
  });
  it('is false on success', () => {
    expect(isRetryable({ error: null, status: 201 })).toBe(false);
  });
});
