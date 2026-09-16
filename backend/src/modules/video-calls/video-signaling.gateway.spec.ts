import { ConflictException } from '@nestjs/common';
import { RoleName } from '@prisma/client';

import { VideoSignalingGateway } from './video-signaling.gateway';

describe('VideoSignalingGateway', () => {
  let gateway: VideoSignalingGateway;
  let access: { forSocket: jest.Mock };
  let lifecycle: { activate: jest.Mock };
  let emitted: Array<{ target: string; event: string; payload: unknown }>;

  const socket = (id: string, identity?: { id: string; roles: RoleName[] }) => ({
    id,
    data: { identity },
    handshake: { auth: {}, headers: {} },
    emit: jest.fn(), join: jest.fn().mockResolvedValue(undefined), leave: jest.fn(), disconnect: jest.fn(),
  });

  beforeEach(() => {
    access = { forSocket: jest.fn() };
    lifecycle = { activate: jest.fn().mockResolvedValue(undefined) };
    emitted = [];
    gateway = new VideoSignalingGateway({ verifyAsync: jest.fn() } as never, { getOrThrow: jest.fn().mockReturnValue('secret') } as never, access as never, lifecycle as never);
    gateway.server = {
      sockets: { sockets: new Map() },
      to: (target: string) => ({ emit: (event: string, payload: unknown) => emitted.push({ target, event, payload }) }),
    } as never;
  });

  it('rejects an unauthenticated socket during its handshake', async () => {
    const client = socket('socket-1');
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('authorizes one mentor and one student, then relays offers only to the opposite peer', async () => {
    access.forSocket
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'MENTOR', accessExpiresAt: new Date() })
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'STUDENT', accessExpiresAt: new Date() });
    const mentor = socket('mentor-socket', { id: 'mentor-user', roles: [RoleName.MENTOR] });
    const student = socket('student-socket', { id: 'student-user', roles: [RoleName.STUDENT] });
    await gateway.join(mentor as never, { bookingId: 'booking-1' });
    expect(lifecycle.activate).not.toHaveBeenCalled();
    await gateway.join(student as never, { bookingId: 'booking-1' });
    expect(lifecycle.activate).toHaveBeenCalledWith('video-1');
    gateway.offer(mentor as never, { bookingId: 'booking-1', offer: { type: 'offer', sdp: 'safe-sdp' } });
    expect(emitted).toContainEqual({ target: 'student-socket', event: 'video:offer', payload: { bookingId: 'booking-1', offer: { type: 'offer', sdp: 'safe-sdp' } } });
    expect(emitted.some((item) => item.target === 'mentor-socket' && item.event === 'video:offer')).toBe(false);
  });

  it('does not relay signaling before an authorized join and clears membership on leave', () => {
    const client = socket('student-socket', { id: 'student-user', roles: [RoleName.STUDENT] });
    gateway.iceCandidate(client as never, { bookingId: 'booking-1', candidate: { candidate: 'candidate' } });
    expect(client.emit).toHaveBeenCalledWith('video:error', expect.objectContaining({ code: 'VIDEO_CALL_FORBIDDEN' }));
    gateway.leave(client as never, { bookingId: 'booking-1' });
    expect(client.emit).toHaveBeenCalledWith('video:error', expect.objectContaining({ code: 'VIDEO_CALL_FORBIDDEN' }));
  });

  it('does not end an ACTIVE session when a participant disconnects or leaves', async () => {
    access.forSocket
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'MENTOR', accessExpiresAt: new Date() })
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'STUDENT', accessExpiresAt: new Date() });
    const mentor = socket('mentor-socket', { id: 'mentor-user', roles: [RoleName.MENTOR] });
    const student = socket('student-socket', { id: 'student-user', roles: [RoleName.STUDENT] });
    await gateway.join(mentor as never, { bookingId: 'booking-1' });
    await gateway.join(student as never, { bookingId: 'booking-1' });

    gateway.leave(student as never, { bookingId: 'booking-1' });
    gateway.handleDisconnect(mentor as never);

    expect(lifecycle.activate).toHaveBeenCalledTimes(1);
    expect(emitted).toContainEqual({ target: 'mentor-socket', event: 'video:peer-left', payload: { participantRole: 'STUDENT' } });
  });

  it('keeps lifecycle presence stable when a same-role reconnect replaces an older socket', async () => {
    access.forSocket
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'MENTOR', accessExpiresAt: new Date() })
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'STUDENT', accessExpiresAt: new Date() })
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'MENTOR', accessExpiresAt: new Date() });
    const originalMentor = socket('mentor-original', { id: 'mentor-user', roles: [RoleName.MENTOR] });
    const student = socket('student-socket', { id: 'student-user', roles: [RoleName.STUDENT] });
    const reconnectingMentor = socket('mentor-reconnected', { id: 'mentor-user', roles: [RoleName.MENTOR] });
    (gateway.server.sockets.sockets as Map<string, unknown>).set('mentor-original', originalMentor);

    await gateway.join(originalMentor as never, { bookingId: 'booking-1' });
    await gateway.join(student as never, { bookingId: 'booking-1' });
    await gateway.join(reconnectingMentor as never, { bookingId: 'booking-1' });
    gateway.handleDisconnect(originalMentor as never);

    expect(lifecycle.activate).toHaveBeenCalledTimes(2);
    expect(originalMentor.disconnect).toHaveBeenCalledWith(true);
    expect(emitted.some((item) => item.target === 'student-socket' && item.event === 'video:peer-left')).toBe(false);
  });

  it('does not add presence or reactivate a session that access has ended', async () => {
    access.forSocket.mockRejectedValue(new ConflictException({
      code: 'VIDEO_CALL_ENDED',
      message: 'Video access has ended for this booking.',
    }));
    const client = socket('student-socket', { id: 'student-user', roles: [RoleName.STUDENT] });

    await gateway.join(client as never, { bookingId: 'booking-1' });

    expect(lifecycle.activate).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('video:error', expect.objectContaining({ code: 'VIDEO_CALL_ENDED' }));
  });
});
