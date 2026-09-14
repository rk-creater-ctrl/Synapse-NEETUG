import { DailyVideoProviderService } from './daily-video-provider.service';
import { DisabledVideoProviderService } from './disabled-video-provider.service';

describe('DailyVideoProviderService', () => {
  const expiresAt = new Date('2026-10-01T10:15:00.000Z');
  let fetchMock: jest.Mock;
  let service: DailyVideoProviderService;

  beforeEach(() => {
    fetchMock = jest.fn();
    const values: Record<string, string> = {
      DAILY_API_KEY: 'daily-secret-key',
      DAILY_API_BASE_URL: 'https://daily.example/v1',
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
    };
    service = new DailyVideoProviderService(config as never, fetchMock as never);
  });

  it('creates a private expiring room without using participant PII in its generated name', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ name: 'session-provider-name', url: 'https://example.daily.co/session-provider-name' }) });
    const result = await service.createRoom({ expiresAt });

    expect(result).toEqual({ roomName: 'session-provider-name', roomUrl: 'https://example.daily.co/session-provider-name', expiresAt });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://daily.example/v1/rooms');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer daily-secret-key' });
    expect(JSON.parse(options.body as string)).toMatchObject({ privacy: 'private', properties: { exp: 1790849700 } });
    expect(JSON.parse(options.body as string).name).not.toContain('student@example.com');
  });

  it('creates a room-scoped short-lived participant token with role mapping', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ token: 'provider-token' }) });
    await expect(service.createParticipantToken({
      roomName: 'room-1', participantId: 'student-1', participantName: 'Student', role: 'STUDENT', expiresAt,
    })).resolves.toEqual({ token: 'provider-token', expiresAt });
    const studentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(studentBody).toMatchObject({ room_name: 'room-1', user_id: 'student-1', exp: 1790849700, is_owner: false });

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ token: 'mentor-token' }) });
    await service.createParticipantToken({
      roomName: 'room-1', participantId: 'mentor-1', participantName: 'Mentor', role: 'MENTOR', expiresAt,
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).is_owner).toBe(true);
  });

  it('sanitizes provider failures and rejects invalid provider payloads', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'daily-secret-key' }) });
    await expect(service.createRoom({ expiresAt })).rejects.toMatchObject({ kind: 'VIDEO_ROOM_CREATION_FAILED' });

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ name: 'missing-url' }) });
    await expect(service.createRoom({ expiresAt })).rejects.toMatchObject({ kind: 'VIDEO_PROVIDER_INVALID_RESPONSE' });
  });

  it('maps network and abort failures to a provider-unavailable error', async () => {
    fetchMock.mockRejectedValue(new Error('network unavailable'));
    await expect(service.createRoom({ expiresAt })).rejects.toMatchObject({ kind: 'VIDEO_PROVIDER_UNAVAILABLE' });

    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    fetchMock.mockRejectedValue(aborted);
    await expect(service.createRoom({ expiresAt })).rejects.toMatchObject({ kind: 'VIDEO_PROVIDER_UNAVAILABLE' });
  });

  it('fails deterministically when video calling is disabled or Daily configuration is absent', async () => {
    const disabled = new DisabledVideoProviderService();
    await expect(disabled.createRoom({ expiresAt })).rejects.toMatchObject({ kind: 'VIDEO_PROVIDER_DISABLED' });

    const unconfigured = new DailyVideoProviderService({ get: jest.fn() } as never, fetchMock as never);
    await expect(unconfigured.createRoom({ expiresAt })).rejects.toMatchObject({ kind: 'VIDEO_PROVIDER_CONFIGURATION' });
  });

  it('never places the API key in provider errors', async () => {
    fetchMock.mockRejectedValue(new Error('daily-secret-key failed'));
    await expect(service.createRoom({ expiresAt })).rejects.toMatchObject({
      kind: 'VIDEO_PROVIDER_UNAVAILABLE',
      message: 'Video provider is unavailable.',
    });
  });
});
