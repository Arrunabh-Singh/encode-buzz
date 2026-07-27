import { describe, test, expect, vi, afterEach } from 'vitest';
import { rpc } from './rpc';

function mockFetchOnce(impl: () => Promise<Response> | never) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rpc', () => {
  test('returns the parsed body on a successful response', async () => {
    mockFetchOnce(async () => new Response(JSON.stringify({ ok: true, code: 'ABCDEF' }), { status: 200 }));
    const result = await rpc('create_room', {});
    expect(result).toEqual({ ok: true, code: 'ABCDEF' });
  });

  test('a non-2xx response becomes { error } instead of throwing', async () => {
    mockFetchOnce(async () => new Response(JSON.stringify({ error: 'Not the host' }), { status: 500 }));
    const result = await rpc('judge_round', {});
    expect(result.error).toBe('Not the host');
    expect(result.offline).toBeUndefined();
  });

  test('a network failure becomes { error, offline: true } instead of an unhandled rejection', async () => {
    mockFetchOnce(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await rpc('record_press', {});
    expect(result.error).toBe('Network error');
    expect(result.offline).toBe(true);
  });

  test('a request timeout is reported distinctly, still without throwing', async () => {
    mockFetchOnce(async () => {
      throw new DOMException('The operation was aborted', 'TimeoutError');
    });
    const result = await rpc('get_session', {});
    expect(result.error).toBe('Request timed out');
    expect(result.offline).toBe(true);
  });
});
