// ------------------------------------------------------------------
// ReviewVisit
//
// The safety-check + save screen. This is where the whole point of
// ASHA Voice comes together:
//
//   1. Reads the pending extraction from sessionStorage (written by
//      RecordVisit).
//   2. Renders the ReviewCard so the ASHA can confirm or fix fields.
//   3. Runs the DETERMINISTIC danger sign engine in the browser.
//      If the LLM was unavailable, ALSO runs the keyword fallback
//      and merges the two results so nothing is missed.
//   4. Shows the AlertPanel (RED / AMBER / GREEN) with reasons and
//      sources.
//   5. On RED, lets the ASHA create a referral slip (written to
//      IndexedDB) and call 108 / PHC.
//   6. On Save, writes the visit + optional referral, then asks the
//      AI for a short warm family message, reads it aloud in the
//      chosen language, and offers WhatsApp / Copy actions.
//
// The engine runs BEFORE the family message so that if the network
// is down, the ASHA still sees the safety check and can act.
// ------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import ReviewCard from '../components/ReviewCard';
import AlertPanel from '../components/AlertPanel';
import { aiUnavailableNotice, evaluate, keywordFallback, mergeResults, type Result } from '../rules/engine';
import { familyMessage } from '../ai/client';
import {
  uid,
  put,
  get,
  getSettings,
  type Person,
  type Visit,
  type Referral,
  type Settings,
} from '../db';
import { SPEECH_LOCALE, type AppLanguage } from '../i18n';
import type { Extraction } from '../ai/schemas';
import type { Lang } from '../rules/dangerSigns';

type Pending = {
  extraction: Extraction;
  transcript: string;
  person_id: string;
  visit_type: Extraction['visit_type'];
  usedFallback: boolean;
};

type SavedState = {
  visitId: string;
  referralId?: string;
  message: string;
};

export default function ReviewVisit() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const lang = ((i18n.language as AppLanguage) || 'en') as Lang;

  const [pending, setPending] = useState<Pending | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState<SavedState | null>(null);
  const [saving, setSaving] = useState(false);

  // -------------------- Load the pending extraction --------------------
  useEffect(() => {
    const raw = sessionStorage.getItem('pending_extraction');
    if (!raw) {
      navigate('/', { replace: true });
      return;
    }
    try {
      const p = JSON.parse(raw) as Pending;
      setPending(p);
      setExtraction(p.extraction);
      void (async () => {
        const [pers, s] = await Promise.all([
          p.person_id ? get<Person>('persons', p.person_id) : Promise.resolve(undefined),
          getSettings(),
        ]);
        setPerson(pers ?? null);
        setSettings(s);
      })();
    } catch {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  // -------------------- Compute the safety result --------------------
  useEffect(() => {
    if (!extraction || !pending) return;

    const ctx = person
      ? {
          category: person.category,
          age_days: person.dob
            ? Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(person.dob).getTime()) / 86400000,
                ),
              )
            : undefined,
          gestational_weeks: person.lmp
            ? Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(person.lmp).getTime()) / (7 * 86400000),
                ),
              )
            : undefined,
          birth_weight_g: person.birth_weight_g,
        }
      : {};

    const ruleResult = evaluate(extraction, ctx);
    const empty = { level: 'green' as const, triggers: [] };
    const kwResult = pending.usedFallback ? keywordFallback(pending.transcript) : empty;
    const notice = pending.usedFallback ? aiUnavailableNotice() : empty;

    setResult(mergeResults(ruleResult, kwResult, notice));
  }, [extraction, person, pending, lang]);

  // -------------------- Save the visit + referral --------------------
  const handleSave = async () => {
    if (!extraction || !result || !pending) return;
    setSaving(true);
    try {
      const visitId = uid();
      const today = new Date().toISOString().slice(0, 10);

      const visit: Visit = {
        id: visitId,
        person_id: pending.person_id || '',
        type: pending.visit_type,
        date: today,
        transcript: pending.transcript,
        extraction,
        alert_level: result.level,
        triggers: result.triggers,
        confirmed_by_asha: true,
        created_offline: !navigator.onLine,
      };
      await put('visits', visit);

      // Referral slip on RED.
      let referralId: string | undefined;
      if (result.level === 'red' && pending.person_id) {
        referralId = uid();
        const referral: Referral = {
          id: referralId,
          person_id: pending.person_id,
          visit_id: visitId,
          facility: settings?.village ? `PHC ${settings.village}` : 'PHC',
          reason: result.triggers.map((trg) => trg.label.en).join(', '),
          status: 'Pending',
          history: [{ at: Date.now(), status: 'Pending' }],
        };
        await put('referrals', referral);
      }

      // Family message — English reasons help the LLM even if the
      // ASHA's UI is in Telugu, because we ask the LLM to reply in
      // the chosen language anyway.
      const message = await familyMessage({
        person_name: person?.name ?? '',
        visit_type: pending.visit_type,
        alert_level: result.level,
        reasons: result.triggers.map((trg) => trg.reason.en),
        language: (settings?.language as AppLanguage) || lang,
      });

      setSaved({ visitId, referralId, message });
      sessionStorage.removeItem('pending_extraction');
    } finally {
      setSaving(false);
    }
  };

  // -------------------- Actions for the saved card --------------------
  const speakMessage = () => {
    if (!saved?.message) return;
    try {
      const u = new SpeechSynthesisUtterance(saved.message);
      u.lang = SPEECH_LOCALE[(settings?.language as AppLanguage) || lang];
      u.rate = settings?.voice_rate ?? 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // Speech synthesis may be unavailable in some browsers.
    }
  };

  const copyMessage = async () => {
    if (!saved?.message) return;
    try {
      await navigator.clipboard.writeText(saved.message);
    } catch {
      // ignore
    }
  };

  const whatsappHref = useMemo(() => {
    if (!saved?.message) return '#';
    return `https://wa.me/?text=${encodeURIComponent(saved.message)}`;
  }, [saved?.message]);

  // -------------------- Render guards --------------------
  if (!pending || !extraction || !result) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        {t('common_loading')}
      </div>
    );
  }

  // ================================================================
  // RENDER: saved state
  // ================================================================
  if (saved) {
    return (
      <div className="space-y-4 pb-24">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">
            ✅ {t('saved')}
          </h1>
          {person && (
            <p className="text-sm text-gray-500 mt-0.5">{person.name}</p>
          )}
        </header>

        {saved.referralId && (
          <div className="rounded-2xl p-3 bg-danger/10 border border-danger text-danger text-sm">
            📝 {t('referral_created')}
          </div>
        )}

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2">
            {t('family_message')}
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            {t('family_message_hint')}
          </p>
          <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
            {saved.message}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={speakMessage}
              className="px-4 py-3 rounded-xl bg-primary text-white font-medium
                         flex items-center gap-2 active:scale-95 transition-transform"
            >
              🔊 {t('play_aloud')}
            </button>

            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-3 rounded-xl border-2 border-primary text-primary
                         font-medium flex items-center gap-2
                         active:scale-95 transition-transform"
            >
              💬 {t('share_whatsapp')}
            </a>

            <button
              type="button"
              onClick={copyMessage}
              className="px-4 py-3 rounded-xl border border-gray-300 text-gray-700
                         font-medium flex items-center gap-2
                         active:scale-95 transition-transform"
            >
              📋 {t('copy')}
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full py-4 rounded-2xl bg-primary text-white text-lg font-semibold
                     active:scale-95 transition-transform"
        >
          {t('common_done')}
        </button>

        <p className="text-center text-[11px] text-gray-400">
          {t('settings_notice')}
        </p>
      </div>
    );
  }

  // ================================================================
  // RENDER: review + alert + save
  // ================================================================
  return (
    <div className="space-y-4 pb-24">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          {person?.name || t('review_title')}
        </h1>
        {person?.category && (
          <p className="text-sm text-gray-500 mt-0.5">{person.category}</p>
        )}
      </header>

      {/* Extraction review (tap to fix) */}
      <ReviewCard
        extraction={extraction}
        lang={lang}
        onChange={setExtraction}
      />

      {/* Safety check */}
      <AlertPanel
        result={result}
        lang={lang}
        onReferral={() => {
          // The referral is created on save. This button just gives
          // the ASHA reassurance that it will be saved.
          alert(t('create_referral'));
        }}
        phcPhone={undefined}
      />

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 rounded-2xl bg-primary text-white text-lg font-semibold
                   active:scale-95 transition-transform disabled:opacity-60"
      >
        {saving ? t('analysing') : t('save_and_message')}
      </button>

      <button
        type="button"
        onClick={() => navigate(-1)}
        disabled={saving}
        className="w-full py-3 rounded-2xl text-gray-500 text-sm"
      >
        {t('onboarding_back')}
      </button>

      <p className="text-center text-[11px] text-gray-400">
        {t('settings_notice')}
      </p>
    </div>
  );
}