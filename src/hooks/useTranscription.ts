'use client';

import { useState, useRef, useCallback } from 'react';

interface TranscriptionState {
  isListening: boolean;
  transcript: string;
  interimText: string;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  clearTranscript: () => void;
}

export function useTranscription(): TranscriptionState {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    setInterimText('');

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      // Get Deepgram API key from our server
      const keyResponse = await fetch('/api/deepgram-key');
      const keyData = await keyResponse.json();

      if (!keyData.key) {
        throw new Error('Could not get transcription key');
      }

      // Connect to Deepgram WebSocket
      const dgUrl = 'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
        model: 'nova-2',
        language: 'en',
        smart_format: 'true',
        punctuate: 'true',
        diarize: 'true',       // Speaker identification
        interim_results: 'true', // Show words as they're spoken
        utterance_end_ms: '1500',
        vad_events: 'true',
      }).toString();

      const socket = new WebSocket(dgUrl, ['token', keyData.key]);
      socketRef.current = socket;

      socket.onopen = () => {
        setIsListening(true);

        // Start recording and sending audio chunks
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };

        // Send audio in 250ms chunks for responsive transcription
        mediaRecorder.start(250);
      };

      let lastSpeaker = -1;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
            const alt = data.channel.alternatives[0];
            const text = alt.transcript;

            if (!text) return;

            if (data.is_final) {
              // Check for speaker diarization
              const words = alt.words || [];
              const speaker = words.length > 0 ? words[0].speaker : undefined;

              let prefix = '';
              if (speaker !== undefined && speaker !== lastSpeaker) {
                prefix = speaker === 0 ? '\n[Caller] ' : `\n[Speaker ${speaker + 1}] `;
                lastSpeaker = speaker;
              }

              setTranscript(prev => {
                const separator = prev && !prefix ? ' ' : '';
                return prev + separator + prefix + text;
              });
              setInterimText('');
            } else {
              setInterimText(text);
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      socket.onerror = () => {
        setError('Transcription connection error. Check your microphone.');
        setIsListening(false);
      };

      socket.onclose = () => {
        setIsListening(false);
      };

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start transcription';
      if (message.includes('Permission denied') || message.includes('NotAllowedError')) {
        setError('Microphone access denied. Please allow microphone access and try again.');
      } else {
        setError(message);
      }
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    // Stop the media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Close the WebSocket
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.close();
    }
    socketRef.current = null;

    // Stop the microphone stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    streamRef.current = null;

    setIsListening(false);
    setInterimText('');
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimText('');
  }, []);

  return {
    isListening,
    transcript,
    interimText,
    error,
    startListening,
    stopListening,
    clearTranscript,
  };
}
