import { RoleName } from '@prisma/client';

import { VideoSignalingGateway } from './video-signaling.gateway';

describe('VideoSignalingGateway', () => {
  let gateway: VideoSignalingGateway;
  let access: { forSocket: jest.Mock };
  let emitted: Array<{ target: string; event: string; payload: unknown }>;

  const socket = (id: string, identity?: { id: string; roles: RoleName[] }) => ({
    id,
    data: { identity },
    handshake: { auth: {}, headers: {} },
    emit: jest.fn(), join: jest.fn().mockResolvedValue(undefined), leave: jest.fn(), disconnect: jest.fn(),
  });

  beforeEach(() => {
    access = { forSocket: jest.fn() };
    emitted = [];
    gateway = new VideoSignalingGateway({ verifyAsync: jest.fn() } as never, { getOrThrow: jest.fn().mockReturnValue('secret') } as never, access as never);
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
    await gateway.join(student as never, { bookingId: 'booking-1' });
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
});
