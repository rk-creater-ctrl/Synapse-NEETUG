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

type CallState = 'authorizing' | 'requesting-media' | 'connecting' | 'waiting' | 'connected' | 'ended' | 'error';
type SignalMessage = { bookingId: string; offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

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
  const [callState, setCallState] = useState<CallState>('authorizing');
  const [error, setError] = useState<string | null>(null);
  const [hasLocalMedia, setHasLocalMedia] = useState(false);
  const [hasRemoteMedia, setHasRemoteMedia] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const releaseResources = useCallback((notifyPeer: boolean) => {
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
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setHasLocalMedia(false);
    setHasRemoteMedia(false);
  }, []);

  const leaveCall = useCallback(() => {
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
        socket.emit('video:offer', { bookingId: bootstrap.bookingId, offer });
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
          localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
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
          if (event.candidate && socketRef.current?.connected) {
            socketRef.current.emit('video:ice-candidate', { bookingId: bootstrap.bookingId, candidate: event.candidate.toJSON() });
          }
        };
        peer.onconnectionstatechange = () => {
          if (sessionEndedRef.current) return;
          if (peer.connectionState === 'connected') setCallState('connected');
          if (peer.connectionState === 'failed') fail('Unable to connect to the peer-to-peer call.');
        };

        setCallState('connecting');
        const socket = io(mentorSignalingUrl(process.env.NEXT_PUBLIC_API_URL), {
          auth: { token: session.accessToken },
          transports: ['websocket'],
          autoConnect: false,
        });
        bootstrapRef.current = bootstrap;
        socketRef.current = socket;
        socket.on('connect', () => socket.emit('video:join', { bookingId: bootstrap.bookingId }));
        socket.on('connect_error', () => fail('Unable to connect to the signaling service.'));
        socket.on('video:joined', () => {
          if (sessionEndedRef.current) return;
          joinedRef.current = true;
          setCallState('waiting');
        });
        socket.on('video:peer-joined', () => { void negotiateOffer(bootstrap); });
        socket.on('video:offer', async (message: SignalMessage) => {
          if (message.bookingId !== bootstrap.bookingId || !message.offer || !peerRef.current) return;
          try {
            await peerRef.current.setRemoteDescription(message.offer);
            for (const candidate of pendingCandidatesRef.current.splice(0)) await peerRef.current.addIceCandidate(candidate);
            const answer = await peerRef.current.createAnswer();
            await peerRef.current.setLocalDescription(answer);
            socket.emit('video:answer', { bookingId: bootstrap.bookingId, answer });
          } catch { fail('Unable to negotiate the peer-to-peer connection.'); }
        });
        socket.on('video:answer', async (message: SignalMessage) => {
          if (message.bookingId !== bootstrap.bookingId || !message.answer || !peerRef.current) return;
          try {
            await peerRef.current.setRemoteDescription(message.answer);
            for (const candidate of pendingCandidatesRef.current.splice(0)) await peerRef.current.addIceCandidate(candidate);
          } catch { fail('Unable to finalize the peer-to-peer connection.'); }
        });
        socket.on('video:ice-candidate', async (message: SignalMessage) => {
          if (message.bookingId !== bootstrap.bookingId || !message.candidate || !peerRef.current) return;
          try {
            if (peerRef.current.remoteDescription) await peerRef.current.addIceCandidate(message.candidate);
            else pendingCandidatesRef.current.push(message.candidate);
          } catch { fail('Unable to process a peer connection update.'); }
        });
        socket.on('video:peer-left', () => {
          if (sessionEndedRef.current) return;
          remoteStream.getTracks().forEach((track) => remoteStream.removeTrack(track));
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
