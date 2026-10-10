// ------------------------------------------------------------------
// RecordVisit — the hero flow
//
// Steps on this screen:
//   1. Pick (or confirm) the person, or add a new one
//   2. Pick the visit type with big icon buttons
//   3. Speak with the mic OR type OR choose a demo transcript
//   4. Tap Review → the next screen runs extraction + rules
//
// Everything on this screen works offline. The actual AI call
// happens on the Review screen.
//
// Query string parameters honoured:
//   ?person_id=<id>     pre-selects a person
//   ?action=<action>    pre-selects the visit type from the plan
// ------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import MicButton, { type MicErrorReason, type MicStatus } from '../components/MicButton';
import PersonForm from '../components/PersonForm';
import { all, put, type Person } from '../db';
import { extractVisit } from '../ai/client';
import { DEMO_TRANSCRIPTS } from '../demo/demoTranscripts';
import { SPEECH_LOCALE, type AppLanguage } from '../i18n';
import { VISIT_TYPE_LABELS, type VisitType } from '../rules/vocabulary';

// Map the planner's action to a visit type.
function actionToVisitType(action: string | null): VisitType {
  switch (action) {
    case 'anc':
      return 'anc';
    case 'newborn':
      return 'newborn';
    case 'postnatal':
      return 'postnatal';
    case 'child':
      return 'child';
    default:
      return 'anc';
  }
}

export default function RecordVisit() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [search] = useSearchParams();

  const lang = (i18n.language as AppLanguage) || 'en';
  const speechLocale = SPEECH_LOCALE[lang];

  // -------------------- State --------------------
  const [persons, setPersons] = useState<Person[]>([]);
  const [personId, setPersonId] = useState<string>(search.get('person_id') || '');
  const [visitType, setVisitType] = useState<VisitType>(
    actionToVisitType(search.get('action')),
  );
  const [transcript, setTranscript] = useState('');
  const [showNewPerson, setShowNewPerson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);

  // -------------------- Load persons --------------------
  useEffect(() => {
    void (async () => {
      const list = await all<Person>('persons');
      list.sort((a, b) => a.name.localeCompare(b.name));
      setPersons(list);
    })();
  }, []);

  const selectedPerson = useMemo(
    () => persons.find((p) => p.id === personId) || null,
    [persons, personId],
  );

  // -------------------- Speech --------------------
  // MicButton sends the full text heard since the mic was switched on.
  // We keep whatever was already in the box (typed or spoken earlier)
  // and put the new speech after it, so nothing is duplicated or lost.
  const baseRef = useRef('');
  const [listening, setListening] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const handleMicStart = () => {
    baseRef.current = transcript.trim();
  };
  const handleTranscript = (heard: string) => {
    const base = baseRef.current;
    setTranscript(base && heard ? `${base} ${heard}` : base || heard);
  };

  const cleanTranscript = transcript.trim();

  const handleMicError = (reason: MicErrorReason) => {
    setMicNote(null);
    if (reason === 'cleared') return;
    if (reason === 'unsupported') setMicNote('Microphone not supported on this browser. Please type or pick a demo transcript.');
    else if (reason === 'denied') setMicNote('Microphone permission denied. Please type or pick a demo transcript.');
    else if (reason === 'network') setMicNote('Voice needs internet (the browser sends audio to Google to turn it into text). Please type, or try again when online.');
    else if (reason === 'ai_failed') setMicNote(t('voice_ai_failed'));
    else if (reason === 'language') setMicNote('This browser cannot listen in this language. Use Google Chrome on an Android phone, or type instead.');
    else setMicNote('Microphone error. You can type or pick a demo transcript.');
  };

  // -------------------- Add new person --------------------
  const addNewPerson = async (newP: Person) => {
    await put('persons', newP);
    setPersons((prev) => [...prev, newP].sort((a, b) => a.name.localeCompare(b.name)));
    setPersonId(newP.id);
    setShowNewPerson(false);
  };

  // -------------------- Review --------------------
  const doReview = async () => {
    if (!cleanTranscript) return;
    setBusy(true);
    try {
      const offline = !navigator.onLine;
      const result = await extractVisit({
        transcript: cleanTranscript,
        visit_type: visitType,
        language: lang,
        context: {
          category: selectedPerson?.category,
          gestational_weeks: selectedPerson?.lmp
            ? Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(selectedPerson.lmp).getTime()) /
                    (7 * 86400000),
                ),
              )
            : undefined,
          age_days: selectedPerson?.dob
            ? Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(selectedPerson.dob).getTime()) /
                    86400000,
                ),
              )
            : undefined,
          birth_weight_g: selectedPerson?.birth_weight_g,
        },
        knownNames: persons.map((p) => p.name),
        offline,
      });

      // Hand off to Review screen via sessionStorage so we don't have
      // to serialise the extraction in the URL.
      sessionStorage.setItem(
        'pending_extraction',
        JSON.stringify({
          extraction: result.extraction,
          transcript: cleanTranscript,
          person_id: personId || '',
          visit_type: visitType,
          usedFallback: result.usedFallback,
        }),
      );
      navigate('/review');
    } finally {
      setBusy(false);
    }
  };

  // -------------------- Render --------------------
  return (
    <div className="space-y-5 pb-24">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          🎤 {t('record_visit')}
        </h1>
      </header>

      {/* -------------------- Person picker -------------------- */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">
            {t('pick_person')}
          </span>
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-3 mt-1
                       bg-white text-base focus:border-primary focus:outline-none"
          >
            <option value="">— {t('select_person')} —</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {selectedPerson && (
          <p className="text-xs text-gray-500 mt-2">
            {selectedPerson.category}
            {selectedPerson.edd ? ` · EDD ${selectedPerson.edd}` : ''}
            {selectedPerson.dob ? ` · DOB ${selectedPerson.dob}` : ''}
          </p>
        )}

        <button
          type="button"
          onClick={() => setShowNewPerson((v) => !v)}
          className="mt-3 text-sm text-primary font-medium"
        >
          + {t('new_person')}
        </button>

        {showNewPerson && (
          <PersonForm
            defaultCategory={
              visitType === 'anc'
                ? 'pregnant'
                : visitType === 'postnatal'
                  ? 'mother'
                  : visitType === 'newborn'
                    ? 'newborn'
                    : visitType === 'child'
                      ? 'child'
                      : 'other'
            }
            onSave={addNewPerson}
            onCancel={() => setShowNewPerson(false)}
          />
        )}
      </section>

      {/* -------------------- Visit type -------------------- */}
      <section>
        <p className="text-sm font-medium text-gray-700 mb-2">
          {t('pick_visit_type')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(VISIT_TYPE_LABELS) as VisitType[]).map((code) => {
            const info = VISIT_TYPE_LABELS[code];
            const active = visitType === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setVisitType(code)}
                className={[
                  'p-4 rounded-2xl border-2 text-left transition-all min-h-[84px]',
                  active
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 bg-white text-gray-800',
                ].join(' ')}
              >
                <div className="text-2xl" aria-hidden="true">
                  {info.icon}
                </div>
                <div className="text-sm font-semibold mt-1 leading-tight">
                  {info[lang]}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* -------------------- Voice / type -------------------- */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-700 mb-3">
          {t('speak_now')}
        </p>

        <div className="flex items-start gap-4">
          <MicButton
            lang={speechLocale}
            onTranscript={handleTranscript}
            onStart={handleMicStart}
            onListeningChange={setListening}
            onError={handleMicError}
            onStatus={setMicStatus}
            disabled={busy}
          />

          <div className="flex-1 min-w-0">
            <p className={`text-xs mb-1 ${listening || micStatus === 'transcribing' ? 'text-danger font-semibold' : 'text-gray-500'}`}>
              {micStatus === 'transcribing'
                ? '⏳ ' + t('voice_ai_note')
                : listening
                  ? '🔴 ' + t('voice_recording')
                  : t('live_transcript')}
            </p>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={6}
              placeholder={t('type_instead')}
              className="w-full border border-gray-300 rounded-xl p-3 text-sm
                         bg-white focus:border-primary focus:outline-none"
            />
            {cleanTranscript && (
              <button
                type="button"
                onClick={() => setTranscript('')}
                className="mt-1 text-xs text-gray-500 underline"
              >
                {t('clear')}
              </button>
            )}
          </div>
        </div>


        {micNote && (
          <p className="mt-3 text-xs text-watch bg-watch/10 rounded-xl p-2">
            ⚠️ {micNote}
          </p>
        )}
        <p className="mt-3 text-[11px] text-gray-400">💡 {t('mic_tip')}</p>
      </section>

      {/* -------------------- Demo transcripts -------------------- */}
      <details className="bg-white rounded-2xl p-4 shadow-sm">
        <summary className="cursor-pointer text-sm text-primary font-medium">
          📝 {t('demo_transcripts')}
        </summary>
        <div className="mt-3 space-y-2">
          {DEMO_TRANSCRIPTS.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setTranscript(d.text);
                setVisitType(d.visit_type);
              }}
              className="block w-full text-left p-3 rounded-xl border border-gray-200
                         bg-white hover:border-primary transition-colors"
            >
              <p className="font-semibold text-sm text-gray-900">{d.label}</p>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                {d.text.slice(0, 100)}…
              </p>
            </button>
          ))}
        </div>
      </details>

      {/* -------------------- Review CTA -------------------- */}
      <button
        type="button"
        onClick={doReview}
        disabled={busy || !cleanTranscript}
        className="w-full py-4 rounded-2xl bg-primary text-white text-lg font-semibold
                   active:scale-95 transition-transform disabled:opacity-50
                   disabled:cursor-not-allowed"
      >
        {busy ? t('analysing') : t('review')}
      </button>

      <p className="text-center text-[11px] text-gray-400">
        {t('settings_notice')}
      </p>
    </div>
  );
}
