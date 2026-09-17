'use client';

import { io, Socket } from 'socket.io-client';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MentorRouteGuard } from '../../../../components/mentor-route-guard';
import { getMentorVideoAccess } from '../../../../lib/mentor-api';
import { useMentorAuth } from '../../../../lib/mentor-auth-context';
import { getMentorSession } from '../../../../lib/mentor-session';
import { MentorVideoAccess } from '../../../../lib/mentor-types';
import {
  mentorAccessErrorMessage,
  mentorMediaErrorMessage,
  mentorPeerConfiguration,
  mentorSignalingErrorMessage,
  mentorSignalingUrl,
} from '../../../../lib/mentor-webrtc';

type CallState = 'authorizing' | 'requesting-media' | 'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'ended' | 'error';
type SignalMessage = { bookingId: string; generation?: number; offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
const MAX_PEER_RECOVERY_ATTEMPTS = 3;
const DISCONNECTED_GRACE_MS = 4_000;

export default function MentorBookingCallPage() {
  const { status } = useMentorAuth();
  const params = useParams<{ bookingId: string }>();
  const router = useRouter();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const bootstrapRef = useRef<MentorVideoAccess | null>(null);
  const joinedRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const makingOfferRef = useRef(false);
  const sessionEndedRef = useRef(false);
  const explicitLeaveRef = useRef(false);
  const generationRef = useRef<number | null>(null);
  const recoveryAttemptsRef = useRef(0);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveringRef = useRef(false);
  const [callState, setCallState] = useState<CallState>('authorizing');
  const [error, setError] = useState<string | null>(null);
  const [hasLocalMedia, setHasLocalMedia] = useState(false);
  const [hasRemoteMedia, setHasRemoteMedia] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const releaseResources = useCallback((notifyPeer: boolean) => {
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
    recoveringRef.current = false;
    const socket = socketRef.current;
    const bootstrap = bootstrapRef.current;
    if (notifyPeer && socket?.connected && joinedRef.current && bootstrap) {
      socket.emit('video:leave', { bookingId: bootstrap.bookingId });
    }
    joinedRef.current = false;
    socketRef.current = null;
    bootstrapRef.current = null;
    socket?.disconnect();
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
    makingOfferRef.current = false;
    generationRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setHasLocalMedia(false);
    setHasRemoteMedia(false);
  }, []);

  const leaveCall = useCallback(() => {
    explicitLeaveRef.current = true;
    releaseResources(true);
    router.replace('/bookings');
  }, [releaseResources, router]);

  const endSession = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    releaseResources(false);
    setCallState('ended');
    setError('This mentor session has ended.');
  }, [releaseResources]);

  useEffect(() => {
    if (status !== 'authenticated' || !params.bookingId) return;
    let disposed = false;
    let endTimer: ReturnType<typeof setTimeout> | undefined;

    const fail = (message: string) => {
      if (!disposed && !sessionEndedRef.current) {
        releaseResources(true);
        setCallState('error');
        setError(message);
      }
    };

    async function negotiateOffer(bootstrap: MentorVideoAccess) {
      const peer = peerRef.current;
      const socket = socketRef.current;
      if (sessionEndedRef.current || !peer || !socket?.connected || makingOfferRef.current || peer.signalingState !== 'stable') return;
      makingOfferRef.current = true;
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        if (generationRef.current === null) return;
        socket.emit('video:offer', { bookingId: bootstrap.bookingId, generation: generationRef.current, offer });
      } catch {
        fail('Unable to negotiate the peer-to-peer connection.');
      } finally {
        makingOfferRef.current = false;
      }
    }

    async function start() {
      const session = getMentorSession();
      if (!session) return;
      sessionEndedRef.current = false;
      explicitLeaveRef.current = false;
      recoveryAttemptsRef.current = 0;
      setCallState('authorizing');
      setError(null);
      try {
        const bootstrap = await getMentorVideoAccess(session.accessToken, params.bookingId);
        if (disposed) return;

        setCallState('requesting-media');
        if (!navigator.mediaDevices?.getUserMedia) {
          fail('Camera and microphone are unavailable in this browser.');
          return;
        }
        let localStream: MediaStream;
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: {
              facingMode: { ideal: 'user' },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 20, max: 24 },
            },
          });
        } catch (caught) {
          fail(mentorMediaErrorMessage(caught));
          return;
        }
        if (disposed) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = localStream;
        setMicrophoneEnabled(true);
        setCameraEnabled(true);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
        setHasLocalMedia(true);

        const createPeer = () => {
          peerRef.current?.close();
          pendingCandidatesRef.current = [];
          setHasRemoteMedia(false);
          const peer = new RTCPeerConnection(mentorPeerConfiguration());
          peerRef.current = peer;
          const remoteStream = new MediaStream();
          remoteStreamRef.current = remoteStream;
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
          localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
          peer.ontrack = (event) => {
          event.streams[0]?.getTracks().forEach((track) => {
            if (!remoteStream.getTracks().some((existing) => existing.id === track.id)) remoteStream.addTrack(track);
          });
          setHasRemoteMedia(remoteStream.getTracks().length > 0);
          };
          peer.onicecandidate = (event) => {
            if (event.candidate && socketRef.current?.connected && generationRef.current !== null) {
              socketRef.current.emit('video:ice-candidate', { bookingId: bootstrap.bookingId, generation: generationRef.current, candidate: event.candidate.toJSON() });
            }
          };
          peer.onconnectionstatechange = () => {
          if (sessionEndedRef.current) return;
          if (peer.connectionState === 'connected') setCallState('connected');
            if (peer.connectionState === 'disconnected' && !recoveryTimerRef.current) {
              recoveryTimerRef.current = setTimeout(() => recover(), DISCONNECTED_GRACE_MS);
            }
            if (peer.connectionState === 'failed') void recover();
          };
          return peer;
        };

        const recover = async () => {
          if (disposed || sessionEndedRef.current || explicitLeaveRef.current || recoveringRef.current) return;
          if (recoveryAttemptsRef.current >= MAX_PEER_RECOVERY_ATTEMPTS) {
            fail('Connection lost. Please retry the call.');
            return;
          }
          recoveringRef.current = true;
          recoveryTimerRef.current = null;
          recoveryAttemptsRef.current += 1;
          joinedRef.current = false;
          setCallState('reconnecting');
          createPeer();
          if (socketRef.current?.connected) socketRef.current.emit('video:join', { bookingId: bootstrap.bookingId });
          else socketRef.current?.connect();
          recoveringRef.current = false;
        };

        createPeer();

        setCallState('connecting');
        const socket = io(mentorSignalingUrl(process.env.NEXT_PUBLIC_API_URL), {
          auth: { token: session.accessToken },
          transports: ['websocket'],
          autoConnect: false,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 500,
          reconnectionDelayMax: 4_000,
        });
        bootstrapRef.current = bootstrap;
        socketRef.current = socket;
        socket.on('connect', () => {
          if (!sessionEndedRef.current && !explicitLeaveRef.current) socket.emit('video:join', { bookingId: bootstrap.bookingId });
        });
        socket.on('disconnect', () => {
          if (!sessionEndedRef.current && !explicitLeaveRef.current) void recover();
        });
        socket.on('connect_error', () => {
          if (recoveryAttemptsRef.current >= MAX_PEER_RECOVERY_ATTEMPTS) fail('Unable to connect to the signaling service.');
        });
        socket.on('video:joined', (message: SignalMessage) => {
          if (sessionEndedRef.current) return;
          if (message.bookingId !== bootstrap.bookingId || typeof message.generation !== 'number') return;
          generationRef.current = message.generation;
          joinedRef.current = true;
          recoveryAttemptsRef.current = 0;
          setCallState('waiting');
        });
        socket.on('video:peer-joined', (message: SignalMessage) => {
          if (message.bookingId !== bootstrap.bookingId || typeof message.generation !== 'number') return;
          const changed = generationRef.current !== message.generation;
          generationRef.current = message.generation;
          if (changed) createPeer();
          void negotiateOffer(bootstrap);
        });
        socket.on('video:offer', async (message: SignalMessage) => {
          if (message.bookingId !== bootstrap.bookingId || message.generation !== generationRef.current || !message.offer || !peerRef.current) return;
          try {
            await peerRef.current.setRemoteDescription(message.offer);
            for (const candidate of pendingCandidatesRef.current.splice(0)) await peerRef.current.addIceCandidate(candidate);
            const answer = await peerRef.current.createAnswer();
            await peerRef.current.setLocalDescription(answer);
            socket.emit('video:answer', { bookingId: bootstrap.bookingId, generation: generationRef.current, answer });
          } catch { fail('Unable to negotiate the peer-to-peer connection.'); }
        });
        socket.on('video:answer', async (message: SignalMessage) => {
          if (message.bookingId !== bootstrap.bookingId || message.generation !== generationRef.current || !message.answer || !peerRef.current) return;
          try {
            await peerRef.current.setRemoteDescription(message.answer);
            for (const candidate of pendingCandidatesRef.current.splice(0)) await peerRef.current.addIceCandidate(candidate);
          } catch { fail('Unable to finalize the peer-to-peer connection.'); }
        });
        socket.on('video:ice-candidate', async (message: SignalMessage) => {
          if (message.bookingId !== bootstrap.bookingId || message.generation !== generationRef.current || !message.candidate || !peerRef.current) return;
          try {
            if (peerRef.current.remoteDescription) await peerRef.current.addIceCandidate(message.candidate);
            else pendingCandidatesRef.current.push(message.candidate);
          } catch { fail('Unable to process a peer connection update.'); }
        });
        socket.on('video:peer-left', (message: SignalMessage) => {
          if (sessionEndedRef.current) return;
          if (message.bookingId !== bootstrap.bookingId || (typeof message.generation === 'number' && message.generation !== generationRef.current)) return;
          const remoteStream = remoteStreamRef.current;
          if (remoteStream) {
            remoteStream.getTracks().forEach((track) => remoteStream.removeTrack(track));
          }
          setHasRemoteMedia(false);
          setCallState('waiting');
        });
        socket.on('video:session-ended', (message: { bookingId?: unknown }) => {
          if (message.bookingId === bootstrap.bookingId) endSession();
        });
        socket.on('video:error', (message: { code?: unknown }) => fail(mentorSignalingErrorMessage(message.code)));
        socket.connect();

        const remaining = new Date(bootstrap.accessExpiresAt).getTime() - Date.now();
        if (remaining <= 0) {
          endSession();
        } else {
          endTimer = setTimeout(() => {
            endSession();
          }, remaining);
        }
      } catch (caught) {
        fail(mentorAccessErrorMessage(caught));
      }
    }

    void start();
    return () => {
      disposed = true;
      if (endTimer) clearTimeout(endTimer);
      releaseResources(true);
    };
  }, [attempt, endSession, params.bookingId, releaseResources, status]);

  function toggleTracks(kind: 'audio' | 'video') {
    const tracks = kind === 'audio' ? localStreamRef.current?.getAudioTracks() : localStreamRef.current?.getVideoTracks();
    if (!tracks?.length) return;
    const next = !tracks[0].enabled;
    tracks.forEach((track) => { track.enabled = next; });
    if (kind === 'audio') setMicrophoneEnabled(next); else setCameraEnabled(next);
  }

  return <MentorRouteGuard><section className="card">
    <h1>Mentor Call</h1>
    <p className="muted">{
      callState === 'authorizing' ? 'Authorizing session…' :
      callState === 'requesting-media' ? 'Requesting camera and microphone…' :
      callState === 'connecting' ? 'Connecting…' :
      callState === 'waiting' ? 'Waiting for student…' :
      callState === 'connected' ? 'Connected' :
      callState === 'reconnecting' ? 'Reconnecting…' :
      callState === 'ended' ? 'Session ended' : 'Unable to connect'
    }</p>
    <div className="webrtc-remote-surface" style={{ minHeight: 360, background: '#172033' }}>
      <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', minHeight: 360 }} />
      {!hasRemoteMedia && <p className="muted">Waiting for student…</p>}
    </div>
    <div className="webrtc-local-surface" style={{ width: 220, marginTop: 12 }}><video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%' }} /></div>
    {error && <p className="error" role="alert">{error}</p>}
    {callState === 'error' && <button type="button" onClick={() => setAttempt((current) => current + 1)}>Retry</button>}
    <div className="actions">
      <button type="button" disabled={!hasLocalMedia || callState === 'ended'} onClick={() => toggleTracks('audio')}>{microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}</button>
      <button type="button" className="secondary-button" disabled={!hasLocalMedia || callState === 'ended'} onClick={() => toggleTracks('video')}>{cameraEnabled ? 'Turn camera off' : 'Turn camera on'}</button>
      <button type="button" className="secondary-button" onClick={leaveCall}>Leave Call</button>
    </div>
  </section></MentorRouteGuard>;
}
