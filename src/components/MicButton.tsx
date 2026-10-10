// ------------------------------------------------------------------
// MicButton
//
// Big circular microphone button that uses the browser's Web Speech
// API. Tap once to start, tap again to stop.
//
// How it reports text: onTranscript(text) always receives EVERYTHING
// heard since the mic was switched on (finished sentences plus the
// sentence still being spoken). The parent simply shows that text,
// so words are never repeated or lost.
//
// Reliability fixes:
//   - Chrome stops listening by itself after a short silence. If the
//     ASHA has not tapped stop, we quietly start listening again.
//   - On Android, continuous mode repeats words, so there we listen
//     one sentence at a time and join the sentences ourselves.
//   - Clear error reasons (no permission, no internet, language not
//     supported) so the screen can tell the ASHA what to do.
//
// Two ways of listening:
//   1. AI voice (default when online): records audio with
//      MediaRecorder and sends it to /api/transcribe (Whisper). Much
//      better for Telugu and Hindi, and works in any modern browser.
//   2. Browser voice (fallback): the Web Speech API, used when the
//      phone is offline, cannot record, or the AI voice failed.
//
// The text is redacted by the parent screen before the language
// model sees it.
// ------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

export type MicErrorReason = 'unsupported' | 'denied' | 'network' | 'language' | 'other' | 'cleared' | 'ai_failed';
export type MicStatus = 'idle' | 'recording' | 'transcribing';

type Props = {
  /** BCP-47 language tag, e.g. 'te-IN' | 'hi-IN' | 'en-IN' */
  lang: string;
  /** Full text heard since the mic was switched on. */
  onTranscript: (text: string) => void;
  /** Called right before listening starts. */
  onStart?: () => void;
  /** Called whenever listening turns on or off. */
  onListeningChange?: (listening: boolean) => void;
  disabled?: boolean;
  onError?: (reason: MicErrorReason) => void;
  /** idle / recording / transcribing, for the status line. */
  onStatus?: (s: MicStatus) => void;
};

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => Rec) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const IS_ANDROID = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

const join = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(' ');

function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function pickMime(): string {
  const MR = (window as any).MediaRecorder;
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    try {
      if (MR.isTypeSupported?.(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export default function MicButton({ lang, onTranscript, onStart, onListeningChange, disabled, onError, onStatus }: Props) {
  const [supported] = useState<boolean>(() => !!getRecognitionCtor() || canRecord());
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const aiFailedRef = useRef(false); // after one AI failure, use browser voice
  const mediaRef = useRef<{ rec: any; stream: MediaStream; chunks: Blob[]; mime: string } | null>(null);

  const recRef = useRef<Rec | null>(null);
  const wantRef = useRef(false); // true while the ASHA wants the mic on
  const committedRef = useRef(''); // text from earlier listening sessions
  const sessionFinalRef = useRef(''); // finished text in the current session
  const fatalRef = useRef(false); // stop auto-restart after a real error

  const cb = useRef({ onTranscript, onStart, onListeningChange, onError, onStatus });
  cb.current = { onTranscript, onStart, onListeningChange, onError, onStatus };

  const setOn = (v: boolean) => {
    setListening(v);
    cb.current.onListeningChange?.(v);
    cb.current.onStatus?.(v ? 'recording' : 'idle');
  };

  // -------------------- AI voice (Whisper) --------------------
  const useAiVoice = () => navigator.onLine && canRecord() && !aiFailedRef.current;

  const startAi = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mime = pickMime();
    const MR = (window as any).MediaRecorder;
    const rec = mime ? new MR(stream, { mimeType: mime }) : new MR(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e: any) => e.data && e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => void finishAi();
    mediaRef.current = { rec, stream, chunks, mime: rec.mimeType || mime || 'audio/webm' };
    rec.start(1000);
    setOn(true);
  };

  const finishAi = async () => {
    const m = mediaRef.current;
    mediaRef.current = null;
    if (!m) return;
    m.stream.getTracks().forEach((tr) => tr.stop());
    setListening(false);
    cb.current.onListeningChange?.(false);
    const blob = new Blob(m.chunks, { type: m.mime });
    if (blob.size < 1000) {
      cb.current.onStatus?.('idle');
      return;
    }
    setTranscribing(true);
    cb.current.onStatus?.('transcribing');
    try {
      const audio = await blobToBase64(blob);
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio, mime: m.mime, language: lang.slice(0, 2) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (data.text) cb.current.onTranscript(data.text);
    } catch {
      aiFailedRef.current = true; // next tap uses the browser's own voice
      cb.current.onError?.('ai_failed');
    } finally {
      setTranscribing(false);
      cb.current.onStatus?.('idle');
    }
  };

  useEffect(() => {
    if (!supported) cb.current.onError?.('unsupported');
  }, [supported]);

  const startSession = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = !IS_ANDROID;
    rec.maxAlternatives = 1;
    sessionFinalRef.current = '';

    rec.onresult = (event: any) => {
      let finals = '';
      let interim = '';
      // Rebuild the whole session text every time, from result 0.
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        const chunk = r[0]?.transcript ?? '';
        if (r.isFinal) finals = join(finals, chunk);
        else interim = join(interim, chunk);
      }
      sessionFinalRef.current = finals;
      cb.current.onTranscript(join(committedRef.current, finals, interim));
    };

    rec.onerror = (event: any) => {
      const code = event?.error || 'other';
      if (code === 'no-speech' || code === 'aborted') return; // harmless, onend restarts
      fatalRef.current = true;
      if (code === 'not-allowed' || code === 'service-not-allowed') cb.current.onError?.('denied');
      else if (code === 'network') cb.current.onError?.('network');
      else if (code === 'language-not-supported') cb.current.onError?.('language');
      else cb.current.onError?.('other');
    };

    rec.onend = () => {
      // Keep what this session heard.
      committedRef.current = join(committedRef.current, sessionFinalRef.current);
      sessionFinalRef.current = '';
      cb.current.onTranscript(committedRef.current);
      if (wantRef.current && !fatalRef.current) {
        // Browser stopped on its own (silence). Listen again.
        try {
          startSession();
          return;
        } catch {
          /* fall through */
        }
      }
      wantRef.current = false;
      recRef.current = null;
      setOn(false);
    };

    recRef.current = rec;
    rec.start();
  };

  // Stop if the language changes or the screen closes.
  useEffect(() => {
    return () => {
      wantRef.current = false;
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      const m = mediaRef.current;
      if (m) {
        mediaRef.current = null;
        try {
          m.rec.onstop = null;
          m.rec.stop();
        } catch {
          /* ignore */
        }
        m.stream.getTracks().forEach((tr) => tr.stop());
      }
    };
  }, [lang]);

  const toggle = async () => {
    if (disabled || !supported || transcribing) return;
    // Stop an AI recording.
    if (mediaRef.current) {
      try {
        mediaRef.current.rec.stop();
      } catch {
        void finishAi();
      }
      return;
    }
    // Start an AI recording when possible.
    if (!wantRef.current && useAiVoice()) {
      cb.current.onStart?.();
      cb.current.onError?.('cleared');
      try {
        await startAi();
        return;
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
          cb.current.onError?.('denied');
          return;
        }
        aiFailedRef.current = true; // fall through to browser voice
      }
    }
    if (!getRecognitionCtor()) {
      cb.current.onError?.('unsupported');
      return;
    }
    if (wantRef.current) {
      wantRef.current = false;
      try {
        recRef.current?.stop();
      } catch {
        setOn(false);
      }
      return;
    }
    cb.current.onStart?.();
    cb.current.onError?.('cleared');
    committedRef.current = '';
    fatalRef.current = false;
    wantRef.current = true;
    try {
      startSession();
      setOn(true);
    } catch {
      wantRef.current = false;
      setOn(false);
      cb.current.onError?.('other');
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || !supported || transcribing}
      aria-pressed={listening}
      aria-label={listening ? 'Stop recording' : 'Start recording'}
      className={[
        'relative h-24 w-24 shrink-0 rounded-full text-white text-4xl',
        'flex items-center justify-center shadow-lg',
        'transition-colors duration-200 select-none',
        listening ? 'bg-danger' : 'bg-gradient-to-br from-primary to-teal-800',
        disabled || !supported || transcribing ? 'opacity-50 cursor-not-allowed' : 'active:scale-95',
      ].join(' ')}
    >
      {listening && (
        <span aria-hidden="true" className="absolute inset-0 rounded-full bg-danger/40 animate-ping" />
      )}
      <span aria-hidden="true" className="relative z-10">
        <Icon name={transcribing ? 'loader' : listening ? 'stop' : 'mic'} size={40} strokeWidth={2.2} />
      </span>
    </button>
  );
}
