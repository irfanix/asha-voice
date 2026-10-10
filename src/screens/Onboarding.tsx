// ------------------------------------------------------------------
// Onboarding
//
// Shown on first run, before any other screen is reachable.
//
// Three steps:
//   1. Choose language (big cards: తెలుగు / हिंदी / English)
//   2. Enter ASHA name + village
//   3. Intro slides (3 icons) + two buttons:
//        - "Start" (empty app, ready to add real people)
//        - "Load demo village" (fictional data for the demo video)
//
// On finish we persist settings to IndexedDB and call onDone() so the
// router switches to the app shell.
// ------------------------------------------------------------------

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { saveSettings } from '../db';
import { loadDemoVillage } from '../demo/demoVillage';
import { SPEECH_LOCALE, type AppLanguage } from '../i18n';

type Step = 0 | 1 | 2;

const LANGUAGES: { code: AppLanguage; label: string; native: string }[] = [
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी' },
  { code: 'en', label: 'English', native: 'English' },
];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<Step>(0);
  const [lang, setLang] = useState<AppLanguage>('en');
  const [ashaName, setAshaName] = useState('');
  const [village, setVillage] = useState('');
  const [loading, setLoading] = useState(false);

  const chooseLanguage = (code: AppLanguage) => {
    setLang(code);
    void i18n.changeLanguage(code);
  };

  const finish = async (loadDemo: boolean) => {
    setLoading(true);
    try {
      await saveSettings({
        language: lang,
        asha_name: ashaName.trim() || 'ASHA',
        village: village.trim() || 'My village',
        demo_mode: loadDemo,
        voice_rate: 1,
      });
      if (loadDemo) await loadDemoVillage();
      onDone();
    } finally {
      setLoading(false);
    }
  };

  // -------------------- Progress dots --------------------
  const Dots = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={
            'h-2 rounded-full transition-all ' +
            (i === step ? 'w-6 bg-primary' : 'w-2 bg-gray-300')
          }
        />
      ))}
    </div>
  );

  // -------------------- Step 0: language --------------------
  if (step === 0) {
    return (
      <div className="min-h-screen bg-bg flex flex-col justify-center px-6 py-10 max-w-[480px] mx-auto">
        <Dots />
        <h1 className="text-2xl font-bold text-center mb-2">
          {t('onboarding_welcome')}
        </h1>
        <p className="text-center text-gray-600 mb-8">
          {t('onboarding_choose_language')}
        </p>

        <div className="grid gap-3">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => chooseLanguage(l.code)}
              className={[
                'p-5 rounded-2xl border-2 text-left transition-all',
                'min-h-[72px] flex items-center justify-between',
                lang === l.code
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-gray-300 bg-white text-gray-800',
              ].join(' ')}
            >
              <div>
                <p className="text-xl font-bold">{l.native}</p>
                <p className="text-xs text-gray-500">{l.label}</p>
              </div>
              <span className="text-2xl" aria-hidden="true">
                {lang === l.code ? '✅' : '○'}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setStep(1)}
          className="mt-8 w-full py-4 rounded-2xl bg-primary text-white text-lg
                     font-semibold active:scale-95 transition-transform"
        >
          {t('onboarding_next')}
        </button>

        <p className="text-center text-xs text-gray-400 mt-6">
          {t('settings_notice')}
        </p>
      </div>
    );
  }

  // -------------------- Step 1: details --------------------
  if (step === 1) {
    return (
      <div className="min-h-screen bg-bg flex flex-col justify-center px-6 py-10 max-w-[480px] mx-auto">
        <Dots />
        <h1 className="text-2xl font-bold text-center mb-8">
          {t('onboarding_your_details')}
        </h1>

        <label className="block mb-4">
          <span className="text-sm text-gray-600">{t('onboarding_name')}</span>
          <input
            type="text"
            value={ashaName}
            onChange={(e) => setAshaName(e.target.value)}
            placeholder="e.g. Lakshmi"
            autoComplete="name"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 mt-1
                       text-base bg-white focus:border-primary focus:outline-none"
          />
        </label>

        <label className="block mb-6">
          <span className="text-sm text-gray-600">{t('onboarding_village')}</span>
          <input
            type="text"
            value={village}
            onChange={(e) => setVillage(e.target.value)}
            placeholder="e.g. Rampur"
            autoComplete="off"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 mt-1
                       text-base bg-white focus:border-primary focus:outline-none"
          />
        </label>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep(0)}
            className="flex-1 py-4 rounded-2xl border-2 border-gray-300 text-gray-700
                       font-semibold active:scale-95 transition-transform"
          >
            {t('onboarding_back')}
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="flex-1 py-4 rounded-2xl bg-primary text-white font-semibold
                       active:scale-95 transition-transform"
          >
            {t('onboarding_next')}
          </button>
        </div>
      </div>
    );
  }

  // -------------------- Step 2: intro slides --------------------
  const slides = [
    {
      icon: '🎤',
      title: t('onboarding_slide1_title'),
      body: t('onboarding_slide1_body'),
    },
    {
      icon: '🚨',
      title: t('onboarding_slide2_title'),
      body: t('onboarding_slide2_body'),
    },
    {
      icon: '📅',
      title: t('onboarding_slide3_title'),
      body: t('onboarding_slide3_body'),
    },
  ];

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center px-6 py-10 max-w-[480px] mx-auto">
      <Dots />
      <h1 className="text-2xl font-bold text-center mb-8">
        {t('onboarding_welcome')}
      </h1>

      <div className="space-y-4">
        {slides.map((s, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm flex gap-3">
            <span className="text-3xl" aria-hidden="true">
              {s.icon}
            </span>
            <div>
              <p className="font-bold text-gray-900">{s.title}</p>
              <p className="text-sm text-gray-600 mt-1">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        <button
          type="button"
          onClick={() => finish(false)}
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-primary text-white text-lg font-semibold
                     active:scale-95 transition-transform disabled:opacity-60"
        >
          {t('onboarding_start')}
        </button>

        <button
          type="button"
          onClick={() => finish(true)}
          disabled={loading}
          className="w-full py-4 rounded-2xl border-2 border-primary text-primary
                     text-lg font-semibold active:scale-95 transition-transform
                     disabled:opacity-60"
        >
          {t('onboarding_load_demo')}
        </button>

        <button
          type="button"
          onClick={() => setStep(1)}
          className="w-full py-3 rounded-2xl text-gray-500 text-sm"
        >
          {t('onboarding_back')}
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        {t('settings_notice')}
      </p>

      {/* Keep this reference so TypeScript knows SPEECH_LOCALE is used here
          if someone later wires TTS into onboarding. */}
      <span hidden>{SPEECH_LOCALE[lang]}</span>
    </div>
  );
}