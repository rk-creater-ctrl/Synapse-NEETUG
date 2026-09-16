import { ConflictException } from '@nestjs/common';
import { RoleName } from '@prisma/client';

import { VideoSignalingGateway } from './video-signaling.gateway';

describe('VideoSignalingGateway', () => {
  const scheduledEndAt = new Date('2030-01-01T00:15:00.000Z');
  let gateway: VideoSignalingGateway;
  let access: { forSocket: jest.Mock };
  let lifecycle: { activate: jest.Mock; end: jest.Mock };
  let emitted: Array<{ target: string; event: string; payload: unknown }>;

  const socket = (id: string, identity?: { id: string; roles: RoleName[] }) => ({
    id,
    data: { identity },
    handshake: { auth: {}, headers: {} },
    emit: jest.fn(), join: jest.fn().mockResolvedValue(undefined), leave: jest.fn(), disconnect: jest.fn(),
  });

  beforeEach(() => {
    access = { forSocket: jest.fn() };
    lifecycle = {
      activate: jest.fn().mockResolvedValue(undefined),
      end: jest.fn().mockResolvedValue(undefined),
    };
    emitted = [];
    gateway = new VideoSignalingGateway({ verifyAsync: jest.fn() } as never, { getOrThrow: jest.fn().mockReturnValue('secret') } as never, access as never, lifecycle as never);
    gateway.server = {
      sockets: { sockets: new Map() },
      to: (target: string) => ({ emit: (event: string, payload: unknown) => emitted.push({ target, event, payload }) }),
    } as never;
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    jest.useRealTimers();
  });

  it('rejects an unauthenticated socket during its handshake', async () => {
    const client = socket('socket-1');
    await gateway.handleConnection(client as never);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('authorizes one mentor and one student, then relays offers only to the opposite peer', async () => {
    access.forSocket
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'MENTOR', scheduledEndAt, accessExpiresAt: scheduledEndAt })
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'STUDENT', scheduledEndAt, accessExpiresAt: scheduledEndAt });
    const mentor = socket('mentor-socket', { id: 'mentor-user', roles: [RoleName.MENTOR] });
    const student = socket('student-socket', { id: 'student-user', roles: [RoleName.STUDENT] });
    await gateway.join(mentor as never, { bookingId: 'booking-1' });
    expect(lifecycle.activate).not.toHaveBeenCalled();
    await gateway.join(student as never, { bookingId: 'booking-1' });
    expect(lifecycle.activate).toHaveBeenCalledWith('video-1');
    await gateway.offer(mentor as never, { bookingId: 'booking-1', offer: { type: 'offer', sdp: 'safe-sdp' } });
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
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'MENTOR', scheduledEndAt, accessExpiresAt: scheduledEndAt })
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'STUDENT', scheduledEndAt, accessExpiresAt: scheduledEndAt });
    const mentor = socket('mentor-socket', { id: 'mentor-user', roles: [RoleName.MENTOR] });
    const student = socket('student-socket', { id: 'student-user', roles: [RoleName.STUDENT] });
    await gateway.join(mentor as never, { bookingId: 'booking-1' });
    await gateway.join(student as never, { bookingId: 'booking-1' });

    void gateway.leave(student as never, { bookingId: 'booking-1' });
    gateway.handleDisconnect(mentor as never);

    expect(lifecycle.activate).toHaveBeenCalledTimes(1);
    expect(emitted).toContainEqual({ target: 'mentor-socket', event: 'video:peer-left', payload: { participantRole: 'STUDENT' } });
  });

  it('keeps lifecycle presence stable when a same-role reconnect replaces an older socket', async () => {
    access.forSocket
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'MENTOR', scheduledEndAt, accessExpiresAt: scheduledEndAt })
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'STUDENT', scheduledEndAt, accessExpiresAt: scheduledEndAt })
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'MENTOR', scheduledEndAt, accessExpiresAt: scheduledEndAt });
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

  it('uses one scheduled booking-end timer across joins and terminates both peers without peer-left events', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const endAt = new Date('2030-01-01T00:15:00.000Z');
    access.forSocket
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'MENTOR', scheduledEndAt: endAt, accessExpiresAt: endAt })
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'STUDENT', scheduledEndAt: endAt, accessExpiresAt: endAt })
      .mockResolvedValueOnce({ bookingId: 'booking-1', videoSessionId: 'video-1', participantRole: 'MENTOR', scheduledEndAt: endAt, accessExpiresAt: endAt });
    const originalMentor = socket('mentor-original', { id: 'mentor-user', roles: [RoleName.MENTOR] });
    const student = socket('student-socket', { id: 'student-user', roles: [RoleName.STUDENT] });
    const reconnectingMentor = socket('mentor-reconnected', { id: 'mentor-user', roles: [RoleName.MENTOR] });
    (gateway.server.sockets.sockets as Map<string, unknown>).set('mentor-original', originalMentor);
    (gateway.server.sockets.sockets as Map<string, unknown>).set('student-socket', student);
    (gateway.server.sockets.sockets as Map<string, unknown>).set('mentor-reconnected', reconnectingMentor);

    await gateway.join(originalMentor as never, { bookingId: 'booking-1' });
    await gateway.join(student as never, { bookingId: 'booking-1' });
    await gateway.join(reconnectingMentor as never, { bookingId: 'booking-1' });
    gateway.handleDisconnect(originalMentor as never);
    await jest.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(lifecycle.end).toHaveBeenCalledTimes(1);
    expect(emitted).toContainEqual({ target: 'mentor-reconnected', event: 'video:session-ended', payload: { bookingId: 'booking-1', reason: 'SCHEDULED_END' } });
    expect(emitted).toContainEqual({ target: 'student-socket', event: 'video:session-ended', payload: { bookingId: 'booking-1', reason: 'SCHEDULED_END' } });
    expect(emitted.some((item) => item.event === 'video:peer-left')).toBe(false);
    expect(reconnectingMentor.disconnect).toHaveBeenCalledWith(true);
    expect(student.disconnect).toHaveBeenCalledWith(true);
    const internal = gateway as unknown as {
      expiryTimers: Map<string, unknown>;
      members: Map<string, unknown>;
    };
    expect(internal.expiryTimers.has('video-1')).toBe(false);
    expect(internal.members.has('video-1')).toBe(false);
  });

  it('ends a READY session at its scheduled end even when only one participant joined', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const endAt = new Date('2030-01-01T00:15:00.000Z');
    access.forSocket.mockResolvedValue({
      bookingId: 'booking-1',
      videoSessionId: 'video-1',
      participantRole: 'STUDENT',
      scheduledEndAt: endAt,
      accessExpiresAt: endAt,
    });
    const student = socket('student-socket', { id: 'student-user', roles: [RoleName.STUDENT] });
    (gateway.server.sockets.sockets as Map<string, unknown>).set('student-socket', student);

    await gateway.join(student as never, { bookingId: 'booking-1' });
    expect(lifecycle.activate).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(lifecycle.end).toHaveBeenCalledTimes(1);
    expect(emitted).toContainEqual({ target: 'student-socket', event: 'video:session-ended', payload: { bookingId: 'booking-1', reason: 'SCHEDULED_END' } });
  });

  it('does not cancel a scheduled expiry when a participant leaves or disconnects', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const endAt = new Date('2030-01-01T00:15:00.000Z');
    access.forSocket.mockResolvedValue({
      bookingId: 'booking-1',
      videoSessionId: 'video-1',
      participantRole: 'STUDENT',
      scheduledEndAt: endAt,
      accessExpiresAt: endAt,
    });
    const student = socket('student-socket', { id: 'student-user', roles: [RoleName.STUDENT] });
    (gateway.server.sockets.sockets as Map<string, unknown>).set('student-socket', student);

    await gateway.join(student as never, { bookingId: 'booking-1' });
    await gateway.leave(student as never, { bookingId: 'booking-1' });
    gateway.handleDisconnect(student as never);
    await jest.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(lifecycle.end).toHaveBeenCalledTimes(1);
  });

  it('does not finalize a join that crosses the scheduled end boundary', async () => {
    jest.useFakeTimers();
    const endAt = new Date('2030-01-01T00:15:00.000Z');
    jest.setSystemTime(new Date('2030-01-01T00:14:59.999Z'));
    access.forSocket.mockImplementation(async () => {
      jest.setSystemTime(endAt);
      return {
        bookingId: 'booking-1',
        videoSessionId: 'video-1',
        participantRole: 'STUDENT',
        scheduledEndAt: endAt,
        accessExpiresAt: endAt,
      };
    });
    const student = socket('student-socket', { id: 'student-user', roles: [RoleName.STUDENT] });

    await gateway.join(student as never, { bookingId: 'booking-1' });

    expect(lifecycle.end).toHaveBeenCalledTimes(1);
    expect(student.join).not.toHaveBeenCalled();
    expect(student.emit).toHaveBeenCalledWith('video:error', expect.objectContaining({ code: 'VIDEO_CALL_ENDED' }));
  });

  it('rejects signaling that races with the scheduled end', async () => {
    jest.useFakeTimers();
    const endAt = new Date('2030-01-01T00:15:00.000Z');
    jest.setSystemTime(new Date('2030-01-01T00:14:59.999Z'));
    access.forSocket.mockResolvedValue({
      bookingId: 'booking-1',
      videoSessionId: 'video-1',
      participantRole: 'MENTOR',
      scheduledEndAt: endAt,
      accessExpiresAt: endAt,
    });
    const mentor = socket('mentor-socket', { id: 'mentor-user', roles: [RoleName.MENTOR] });
    (gateway.server.sockets.sockets as Map<string, unknown>).set('mentor-socket', mentor);

    await gateway.join(mentor as never, { bookingId: 'booking-1' });
    jest.setSystemTime(endAt);
    await gateway.offer(mentor as never, { bookingId: 'booking-1', offer: { type: 'offer', sdp: 'safe-sdp' } });

    expect(lifecycle.end).toHaveBeenCalledTimes(1);
    expect(mentor.emit).toHaveBeenCalledWith('video:error', expect.objectContaining({ code: 'VIDEO_CALL_ENDED' }));
    expect(emitted.some((item) => item.event === 'video:offer')).toBe(false);
  });
});
