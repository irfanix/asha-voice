// ------------------------------------------------------------------
// MicButton
//
// Big circular microphone button that uses the browser's Web Speech
// API. It streams interim results while the ASHA is speaking so the
// transcript appears live, and calls onTranscript() on every update.
//
// Graceful degradation:
//   - If the browser does not support SpeechRecognition, the button
//     is disabled and the caller should offer the "type instead" and
//     "demo transcript" fallbacks (which the RecordVisit screen does).
//   - If permission is denied, the same fallbacks apply.
//   - A continuous stream is used; the user taps again to stop.
//
// The button never sends anything to the network. It only produces
// text that the parent screen redacts before any AI call.
// ------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

type Props = {
  /** BCP-47 language tag, e.g. 'te-IN' | 'hi-IN' | 'en-IN' */
  lang: string;
  /** Called on every recognised chunk. `final` is true for a final result. */
  onTranscript: (text: string, final: boolean) => void;
  /** Set true to disable the button (e.g. while the review card is loading). */
  disabled?: boolean;
  /** Optional error callback so the parent can show a message. */
  onError?: (reason: 'unsupported' | 'denied' | 'other') => void;
};

// Minimal typings for the Web Speech API (not in lib.dom.d.ts by default).
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function MicButton({ lang, onTranscript, disabled, onError }: Props) {
  const [supported, setSupported] = useState<boolean>(true);
  const [listening, setListening] = useState<boolean>(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);

  // Keep callbacks fresh without re-creating the recogniser.
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Create the recogniser once and re-create it whenever language changes.
  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      onErrorRef.current?.('unsupported');
      return;
    }
    setSupported(true);

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (event: any) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const chunk = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += chunk;
        else interim += chunk;
      }
      if (finalText) onTranscriptRef.current(finalText, true);
      else if (interim) onTranscriptRef.current(interim, false);
    };

    rec.onerror = (event: any) => {
      const code = event?.error || 'other';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        onErrorRef.current?.('denied');
      } else if (code !== 'no-speech' && code !== 'aborted') {
        onErrorRef.current?.('other');
      }
      setListening(false);
    };

    rec.onend = () => {
      // The recogniser ends automatically after silence. Restart it
      // if we are still in "listening" mode so the visit keeps going.
      if (listening) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recRef.current = rec;

    return () => {
      try {
        rec.abort();
      } catch {
        // ignore
      }
      recRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const toggle = () => {
    if (disabled || !supported || !recRef.current) return;
    if (listening) {
      try {
        recRef.current.stop();
      } catch {
        // ignore
      }
      setListening(false);
    } else {
      try {
        recRef.current.start();
        setListening(true);
      } catch {
        // If start throws (already running, etc.), keep state honest.
        setListening(false);
      }
    }
  };

  const ringColour = listening ? 'bg-danger/40' : 'bg-primary/30';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || !supported}
      aria-pressed={listening}
      aria-label={listening ? 'Stop recording' : 'Start recording'}
      className={[
        'relative h-24 w-24 rounded-full text-white text-4xl',
        'flex items-center justify-center shadow-lg',
        'transition-colors duration-200 select-none',
        listening ? 'bg-danger' : 'bg-primary',
        disabled || !supported ? 'opacity-50 cursor-not-allowed' : 'active:scale-95',
      ].join(' ')}
    >
      {/* Pulsing ring while listening */}
      {listening && (
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full ${ringColour} animate-ping`}
        />
      )}

      {/* Inner icon */}
      <span aria-hidden="true" className="relative z-10">
        {listening ? '⏹' : '🎤'}
      </span>
    </button>
  );
}