import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleName } from '@prisma/client';

import { CommunityGateway } from './community.gateway';

describe('CommunityGateway', () => {
  const createdAt = new Date('2026-09-20T10:00:00.000Z');
  let gateway: CommunityGateway;
  let jwt: { verifyAsync: jest.Mock };
  let communities: { getForUser: jest.Mock };
  let messages: { create: jest.Mock };
  let broadcasts: Array<{ room: string; event: string; payload: unknown }>;

  type MockSocket = {
    id: string;
    data: { authentication?: Promise<void> };
    handshake: { auth: { token?: string }; headers: Record<string, never> };
    disconnect: jest.Mock;
    join: jest.Mock;
    leave: jest.Mock;
  };

  const persistedMessage = (overrides: Record<string, unknown> = {}) => ({
    id: 'message-1',
    communityId: 'community-1',
    content: 'Hello community',
    isDeleted: false,
    replyToMessageId: null,
    attachments: [],
    createdAt,
    updatedAt: createdAt,
    author: { id: 'student-1', displayName: 'Asha Student' },
    ...overrides,
  });

  const socket = (id: string): MockSocket => ({
    id,
    data: {},
    handshake: { auth: {} as { token?: string }, headers: {} },
    disconnect: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
  });

  const authenticate = async (client: MockSocket, userId = 'student-1') => {
    client.handshake.auth.token = 'access-token';
    jwt.verifyAsync.mockResolvedValueOnce({ sub: userId, roles: [RoleName.STUDENT] });
    gateway.handleConnection(client as never);
    await client.data.authentication;
  };

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    communities = { getForUser: jest.fn().mockResolvedValue({ id: 'community-1' }) };
    messages = { create: jest.fn().mockResolvedValue(persistedMessage()) };
    broadcasts = [];
    gateway = new CommunityGateway(
      jwt as never,
      { getOrThrow: jest.fn().mockReturnValue('jwt-secret') } as never,
      communities as never,
      messages as never,
    );
    gateway.server = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => broadcasts.push({ room, event, payload }),
      }),
    } as never;
  });

  it('waits for asynchronous handshake authentication before joining a public community', async () => {
    const client = socket('socket-1');
    client.handshake.auth.token = 'access-token';
    let resolveVerification: (() => void) | undefined;
    jwt.verifyAsync.mockImplementationOnce(() => new Promise<{ sub: string; roles: RoleName[] }>((resolve) => {
      resolveVerification = () => resolve({ sub: 'student-1', roles: [RoleName.STUDENT] });
    }));

    gateway.handleConnection(client as never);
    const joining = gateway.join(client as never, { communityId: 'community-1' });
    expect(communities.getForUser).not.toHaveBeenCalled();

    if (!resolveVerification) throw new Error('Expected authentication verification to be pending.');
    resolveVerification();

    await expect(joining).resolves.toEqual({ ok: true, data: { communityId: 'community-1' } });
    expect(communities.getForUser).toHaveBeenCalledWith('student-1', 'community-1');
    expect(client.join).toHaveBeenCalledWith('community:community-1');
  });

  it('disconnects an unauthenticated socket and rejects its events safely', async () => {
    const client = socket('socket-1');

    gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    await expect(gateway.join(client as never, { communityId: 'community-1' })).resolves.toEqual({
      ok: false,
      error: { code: 'COMMUNITY_SOCKET_UNAUTHORIZED', message: 'Community socket authentication is required.' },
    });
  });

  it('rejects an invalid handshake token before it can join or send', async () => {
    const client = socket('socket-invalid');
    client.handshake.auth.token = 'invalid-token';
    jwt.verifyAsync.mockRejectedValueOnce(new Error('invalid token'));

    gateway.handleConnection(client as never);
    await client.data.authentication;

    await expect(gateway.sendMessage(client as never, { communityId: 'community-1', content: 'Hello' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMUNITY_SOCKET_UNAUTHORIZED' },
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(messages.create).not.toHaveBeenCalled();
  });

  it('joins public communities and active private memberships through the existing read policy', async () => {
    const publicReader = socket('socket-public');
    const privateMember = socket('socket-private');
    await authenticate(publicReader, 'public-reader');
    await authenticate(privateMember, 'private-member');

    await expect(gateway.join(publicReader as never, { communityId: 'community-public' })).resolves.toMatchObject({ ok: true });
    await expect(gateway.join(privateMember as never, { communityId: 'community-private' })).resolves.toMatchObject({ ok: true });

    expect(communities.getForUser).toHaveBeenNthCalledWith(1, 'public-reader', 'community-public');
    expect(communities.getForUser).toHaveBeenNthCalledWith(2, 'private-member', 'community-private');
  });

  it('does not join non-members or banned memberships to private communities', async () => {
    const client = socket('socket-private');
    await authenticate(client);
    communities.getForUser.mockRejectedValueOnce(new NotFoundException({
      code: 'COMMUNITY_NOT_FOUND', message: 'Community not found.',
    }));

    await expect(gateway.join(client as never, { communityId: 'community-private' })).resolves.toEqual({
      ok: false,
      error: { code: 'COMMUNITY_NOT_FOUND', message: 'Community not found.' },
    });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('derives room names server-side and leaves idempotently without changing membership data', async () => {
    const client = socket('socket-1');
    await authenticate(client);

    await gateway.join(client as never, { communityId: 'community-1', room: 'attacker-controlled' });
    await expect(gateway.leave(client as never, { communityId: 'community-1' })).resolves.toEqual({
      ok: true,
      data: { communityId: 'community-1' },
    });
    await expect(gateway.leave(client as never, { communityId: 'community-1' })).resolves.toMatchObject({ ok: true });

    expect(client.join).toHaveBeenCalledWith('community:community-1');
    expect(client.leave).toHaveBeenCalledWith('community:community-1');
    expect(messages.create).not.toHaveBeenCalled();
  });

  it('delegates an authenticated GROUP member send to persistent message creation before broadcasting', async () => {
    const client = socket('socket-1');
    await authenticate(client);
    const message = persistedMessage({ content: 'Announcement' });
    messages.create.mockResolvedValueOnce(message);

    await expect(gateway.sendMessage(client as never, {
      communityId: 'community-1', content: 'Announcement', authorUserId: 'attacker-user', role: 'OWNER',
    })).resolves.toEqual({ ok: true, data: message });

    expect(messages.create).toHaveBeenCalledWith('student-1', 'community-1', { content: 'Announcement' });
    expect(broadcasts).toEqual([{ room: 'community:community-1', event: 'community:message:new', payload: message }]);
  });

  it('does not broadcast when Phase 12C rejects a CHANNEL member, banned member, or muted member', async () => {
    const client = socket('socket-1');
    await authenticate(client);
    messages.create.mockRejectedValueOnce(new ForbiddenException({
      code: 'COMMUNITY_MESSAGE_PUBLISH_FORBIDDEN', message: 'You cannot publish messages in this community.',
    }));

    await expect(gateway.sendMessage(client as never, { communityId: 'community-1', content: 'Blocked' })).resolves.toEqual({
      ok: false,
      error: { code: 'COMMUNITY_MESSAGE_PUBLISH_FORBIDDEN', message: 'You cannot publish messages in this community.' },
    });
    expect(broadcasts).toEqual([]);
  });

  it('allows message sending without a room subscription but does not manufacture sender delivery', async () => {
    const client = socket('socket-unsubscribed');
    await authenticate(client);
    const message = persistedMessage({ id: 'message-2' });
    messages.create.mockResolvedValueOnce(message);

    await expect(gateway.sendMessage(client as never, { communityId: 'community-1', content: 'Hello community' }))
      .resolves.toEqual({ ok: true, data: message });

    expect(client.join).not.toHaveBeenCalled();
    expect(broadcasts).toEqual([{ room: 'community:community-1', event: 'community:message:new', payload: message }]);
  });

  it('broadcasts a persisted attachment-message DTO unchanged without sending file bytes', () => {
    const message = persistedMessage({
      id: 'message-attachment-1',
      content: null,
      attachments: [{
        id: 'attachment-1', type: 'DOCUMENT', fileName: 'notes.pdf', mimeType: 'application/pdf',
        sizeBytes: 128, accessUrl: '/api/v1/communities/attachments/attachment-1',
      }],
    });

    gateway.broadcastMessage(message as never);

    expect(broadcasts).toEqual([{ room: 'community:community-1', event: 'community:message:new', payload: message }]);
    expect(JSON.stringify(broadcasts)).not.toContain('%PDF-');
  });

  it('validates malformed payloads without calling community services', async () => {
    const client = socket('socket-1');
    await authenticate(client);

    await expect(gateway.join(client as never, {})).resolves.toMatchObject({
      ok: false, error: { code: 'COMMUNITY_SOCKET_PAYLOAD_INVALID' },
    });
    await expect(gateway.sendMessage(client as never, { communityId: 'community-1', content: 'x'.repeat(4001) })).resolves.toMatchObject({
      ok: false, error: { code: 'COMMUNITY_MESSAGE_CONTENT_INVALID' },
    });
    expect(communities.getForUser).not.toHaveBeenCalled();
    expect(messages.create).not.toHaveBeenCalled();
  });

  it('does not expose internal persistence errors through socket acknowledgements', async () => {
    const client = socket('socket-1');
    await authenticate(client);
    messages.create.mockRejectedValueOnce(new Error('database connection details'));

    await expect(gateway.sendMessage(client as never, { communityId: 'community-1', content: 'Hello' })).resolves.toEqual({
      ok: false,
      error: {
        code: 'COMMUNITY_SOCKET_OPERATION_FAILED',
        message: 'Community socket operation could not be completed.',
      },
    });
    expect(broadcasts).toEqual([]);
  });

  it('keeps separate socket subscriptions for multiple devices of the same user', async () => {
    const firstDevice = socket('device-1');
    const secondDevice = socket('device-2');
    await authenticate(firstDevice);
    await authenticate(secondDevice);

    await gateway.join(firstDevice as never, { communityId: 'community-1' });
    await gateway.join(secondDevice as never, { communityId: 'community-1' });

    expect(firstDevice.join).toHaveBeenCalledWith('community:community-1');
    expect(secondDevice.join).toHaveBeenCalledWith('community:community-1');
  });
});
