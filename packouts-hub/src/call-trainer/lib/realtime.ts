import type { TranscriptEntry } from './storage';
import { fetchToken } from './api';

export interface RealtimeCallbacks {
  onTranscript: (entry: TranscriptEntry) => void;
  onStatusChange: (status: 'connecting' | 'connected' | 'active' | 'ended') => void;
  onError: (error: string) => void;
}

export interface RealtimeConnection {
  disconnect: () => void;
  peerConnection: RTCPeerConnection;
}

export async function connect(
  instructions: string,
  voice: string,
  callbacks: RealtimeCallbacks,
): Promise<RealtimeConnection> {
  callbacks.onStatusChange('connecting');

  // 1. Get ephemeral token from Cloud Run backend
  const session = await fetchToken(instructions, voice);
  const ephemeralKey = session.client_secret.value;

  // 2. Create peer connection
  const pc = new RTCPeerConnection();

  // 3. Set up remote audio playback
  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  pc.ontrack = (e) => {
    audioEl.srcObject = e.streams[0];
  };

  // 4. Get local mic and add track
  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // 5. Create data channel for events
  const dc = pc.createDataChannel('oai-events');

  dc.onopen = () => {
    callbacks.onStatusChange('connected');
    setTimeout(() => callbacks.onStatusChange('active'), 500);
  };

  // Track assistant transcript assembly
  let currentAssistantText = '';

  dc.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);

      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        if (event.transcript?.trim()) {
          callbacks.onTranscript({
            role: 'user',
            text: event.transcript.trim(),
            timestamp: Date.now(),
          });
        }
      }

      if (event.type === 'response.audio_transcript.delta') {
        currentAssistantText += event.delta || '';
      }

      if (event.type === 'response.audio_transcript.done') {
        const text = (event.transcript || currentAssistantText).trim();
        if (text) {
          callbacks.onTranscript({
            role: 'assistant',
            text,
            timestamp: Date.now(),
          });
        }
        currentAssistantText = '';
      }

      if (event.type === 'error') {
        callbacks.onError(event.error?.message || 'Unknown realtime error');
      }
    } catch {
      // Ignore non-JSON messages
    }
  };

  // 6. Create offer and set local description
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // 7. Send offer to OpenAI Realtime API
  const sdpRes = await fetch(
    'https://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    },
  );

  if (!sdpRes.ok) throw new Error('Failed to connect to OpenAI Realtime');

  // 8. Set remote description
  const answerSdp = await sdpRes.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

  const disconnect = () => {
    dc.close();
    pc.close();
    localStream.getTracks().forEach(track => track.stop());
    audioEl.srcObject = null;
    callbacks.onStatusChange('ended');
  };

  return { disconnect, peerConnection: pc };
}
