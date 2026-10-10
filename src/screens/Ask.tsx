// ------------------------------------------------------------------
// Ask ASHA Didi
//
// A small chat screen where the ASHA can ask questions by voice or
// text. Answers come ONLY from the curated knowledge base in
// src/knowledge/*.md via /api/ask, and always show their sources.
//
// Safety rules enforced by the server:
//   - dosing / medicine questions are politely refused
//   - out-of-scope questions get "If in doubt, refer to the PHC."
//
// This screen also supports read-aloud of every answer so a low-
// literacy ASHA can hear it in her own language.
// ------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import MicButton from '../components/MicButton';
import { askDidi } from '../ai/client';
import { getSettings, type Settings } from '../db';
import { SPEECH_LOCALE, type AppLanguage } from '../i18n';

type LogEntry = {
  id: string;
  q: string;
  a: string;
  sources: string[];
  refused?: boolean;
};

const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function Ask() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as AppLanguage) || 'en';
  const speechLocale = SPEECH_LOCALE[lang];

  const [question, setQuestion] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Load settings for voice rate / preferred language.
  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  // Auto-scroll to the newest entry.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  // -------------------- Ask --------------------
  const send = useCallback(
    async (q?: string) => {
      const query = (q ?? question).trim();
      if (!query || busy) return;
      setBusy(true);
      try {
        const res = await askDidi({ question: query, language: lang });
        const refused =
          res.sources.length === 0 &&
          /cannot advise|not advise|consult the PHC|refus/i.test(res.answer);
        setLog((prev) => [
          ...prev,
          {
            id: uid(),
            q: query,
            a: res.answer,
            sources: res.sources,
            refused,
          },
        ]);
        setQuestion('');
      } finally {
        setBusy(false);
      }
    },
    [question, busy, lang],
  );

  // -------------------- Speech input --------------------
  const handleTranscript = (chunk: string, final: boolean) => {
    if (!final) return;
    setQuestion((prev) => (prev ? prev + ' ' : '') + chunk.trim());
  };

  // -------------------- Speech output --------------------
  const speak = (text: string) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = speechLocale;
      u.rate = settings?.voice_rate ?? 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // speech synthesis may be unavailable
    }
  };

  // -------------------- Suggested starter questions --------------------
  const starters: Record<AppLanguage, string[]> = {
    en: [
      'What should I tell a mother whose baby has yellow eyes?',
      'When should I refer a child with diarrhoea?',
      'What are the danger signs in pregnancy?',
    ],
    hi: [
      'जिस बच्चे की आँखें पीली हैं उसकी माँ को क्या बताऊँ?',
      'दस्त वाले बच्चे को कब रेफर करूँ?',
      'गर्भावस्था में खतरे के संकेत क्या हैं?',
    ],
    te: [
      'కళ్లు పసుపు రంగులో ఉన్న పాప తల్లికి ఏం చెప్పాలి?',
      'విరేచనాలు ఉన్న పిల్లవాడిని ఎప్పుడు రెఫర్ చేయాలి?',
      'గర్భధారణలో ప్రమాద సూచనలు ఏమిటి?',
    ],
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] pb-4">
      <header className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('ask_title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('ask_hint')}</p>
      </header>

      {/* Conversation */}
      <div
        ref={logRef}
        className="flex-1 overflow-y-auto space-y-3 pr-1 -mr-1"
        aria-live="polite"
      >
        {log.length === 0 && (
          <div className="space-y-2">
            <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 text-sm text-gray-700">
              <p className="font-semibold mb-1">💡 {t('ask_hint')}</p>
              <p className="text-xs text-gray-500">
                {t('ask_refuse')}
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-3 mb-1">
              Suggested questions:
            </p>
            <ul className="space-y-2">
              {starters[lang].map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void send(s)}
                    className="w-full text-left p-3 rounded-xl border border-gray-200
                               bg-white text-sm text-gray-800
                               hover:border-primary transition-colors"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {log.map((entry) => (
          <div key={entry.id} className="space-y-2">
            {/* Question bubble */}
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-primary text-white rounded-2xl
                              rounded-tr-sm px-3 py-2 text-sm">
                {entry.q}
              </div>
            </div>

            {/* Answer bubble */}
            <div className="flex justify-start">
              <div
                className={[
                  'max-w-[90%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm',
                  entry.refused
                    ? 'bg-watch/10 text-watch border border-watch/30'
                    : 'bg-white text-gray-800 border border-gray-200',
                ].join(' ')}
              >
                <p className="whitespace-pre-wrap">{entry.a}</p>

                {entry.sources.length > 0 && (
                  <p className="text-[11px] text-gray-500 mt-2">
                    📚 {t('ask_sources')}: {entry.sources.join(', ')}
                  </p>
                )}

                <p className="text-[11px] text-gray-400 mt-1 italic">
                  {t('ask_refuse')}
                </p>

                <button
                  type="button"
                  onClick={() => speak(entry.a)}
                  className="mt-2 text-xs text-primary underline"
                >
                  🔊 {t('play_aloud')}
                </button>
              </div>
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl
                            rounded-tl-sm px-3 py-2 text-sm text-gray-500">
              {t('ask_thinking')}
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="mt-3 bg-white rounded-2xl p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <MicButton
            lang={speechLocale}
            onTranscript={handleTranscript}
            disabled={busy}
          />

          <div className="flex-1 min-w-0">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              placeholder={t('ask_placeholder')}
              className="w-full border border-gray-300 rounded-xl p-3 text-sm
                         bg-white focus:border-primary focus:outline-none resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !question.trim()}
                className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold
                           active:scale-95 transition-transform
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? t('ask_thinking') : t('ask_button')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-gray-400 mt-2">
        {t('settings_notice')}
      </p>
    </div>
  );
}