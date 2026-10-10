// ------------------------------------------------------------------
// Settings
//
// Everything configurable in one place:
//   - language (te / hi / en)
//   - voice speed
//   - demo mode / load demo village
//   - export all data as JSON backup
//   - delete all data (with confirmation)
//   - privacy notice
//   - about & safety notice
//
// The "delete all" action is deliberately harder to tap than the
// others (a confirm dialog + a red button) to prevent accidents.
// ------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  db,
  getSettings,
  saveSettings,
  STORES,
  type Settings as SettingsType,
} from '../db';
import { loadDemoVillage } from '../demo/demoVillage';
import { type AppLanguage } from '../i18n';

const LANGUAGES: { code: AppLanguage; native: string; label: string }[] = [
  { code: 'te', native: 'తెలుగు', label: 'Telugu' },
  { code: 'hi', native: 'हिंदी', label: 'Hindi' },
  { code: 'en', native: 'English', label: 'English' },
];

export default function Settings() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoLoading, setDemoLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // -------------------- Load --------------------
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getSettings();
      setSettings(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-dismiss toast.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(id);
  }, [toast]);

  // -------------------- Mutations --------------------
  const update = async (patch: Partial<SettingsType>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    if (patch.language) {
      void i18n.changeLanguage(patch.language);
    }
  };

  const handleLoadDemo = async () => {
    setDemoLoading(true);
    try {
      await loadDemoVillage();
      setToast(t('settings_demo_loaded'));
    } finally {
      setDemoLoading(false);
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const d = await db();
      const dump: Record<string, unknown> = { exported_at: new Date().toISOString() };
      for (const store of STORES) {
        dump[store] = await d.getAll(store as any);
      }
      const blob = new Blob([JSON.stringify(dump, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asha-voice-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  };

  const handleWipe = async () => {
    const ok = window.confirm(t('settings_wipe_confirm'));
    if (!ok) return;
    const d = await db();
    for (const store of STORES) {
      await d.clear(store as any);
    }
    // Also clear the language + reload so the app returns to onboarding.
    window.location.reload();
  };

  // -------------------- Render --------------------
  if (loading || !settings) {
    return (
      <p className="text-center py-12 text-gray-400 text-sm">
        {t('common_loading')}
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          ⚙️ {t('settings_title')}
        </h1>
      </header>

      {/* -------------------- Language -------------------- */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-3">
          🌐 {t('settings_language')}
        </h2>
        <div className="space-y-2">
          {LANGUAGES.map((l) => {
            const active = settings.language === l.code;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => update({ language: l.code })}
                className={[
                  'w-full flex items-center justify-between p-3 rounded-xl border-2',
                  'min-h-[56px] text-left transition-colors',
                  active
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-200 bg-white text-gray-800',
                ].join(' ')}
              >
                <div>
                  <p className="font-semibold">{l.native}</p>
                  <p className="text-xs text-gray-500">{l.label}</p>
                </div>
                <span className="text-2xl" aria-hidden="true">
                  {active ? '✅' : '○'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* -------------------- Profile -------------------- */}
      <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">
            {t('settings_asha_name')}
          </span>
          <input
            type="text"
            value={settings.asha_name}
            onChange={(e) => update({ asha_name: e.target.value })}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 mt-1
                       text-base focus:border-primary focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">
            {t('settings_village')}
          </span>
          <input
            type="text"
            value={settings.village}
            onChange={(e) => update({ village: e.target.value })}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 mt-1
                       text-base focus:border-primary focus:outline-none"
          />
        </label>
      </section>

      {/* -------------------- Voice rate -------------------- */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-semibold text-gray-900">
            🗣️ {t('settings_voice_rate')}
          </h2>
          <span className="text-sm text-primary font-semibold">
            {settings.voice_rate.toFixed(1)}×
          </span>
        </div>
        <input
          type="range"
          min="0.6"
          max="1.6"
          step="0.1"
          value={settings.voice_rate}
          onChange={(e) => update({ voice_rate: Number(e.target.value) })}
          className="w-full"
        />
      </section>

      {/* -------------------- Demo mode -------------------- */}
      <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-900">
          🎬 {t('settings_demo_mode')}
        </h2>
        <button
          type="button"
          onClick={handleLoadDemo}
          disabled={demoLoading}
          className="w-full py-3 rounded-xl border-2 border-primary text-primary
                     font-semibold active:scale-95 transition-transform
                     disabled:opacity-60"
        >
          {demoLoading ? t('common_loading') : t('settings_demo_load')}
        </button>
        <p className="text-xs text-gray-500">
          Loads 12 fictional households, 3 pregnant women, 2 newborns,
          and children with vaccines due. Safe to run more than once.
        </p>
      </section>

      {/* -------------------- Data -------------------- */}
      <section className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-900">💾 Data</h2>

        <button
          type="button"
          onClick={handleExport}
          disabled={exportLoading}
          className="w-full py-3 rounded-xl border border-gray-300 text-gray-700
                     font-medium active:scale-95 transition-transform
                     disabled:opacity-60"
        >
          {exportLoading ? t('common_loading') : `⬇️ ${t('settings_export')}`}
        </button>

        <button
          type="button"
          onClick={handleWipe}
          className="w-full py-3 rounded-xl bg-danger text-white font-semibold
                     active:scale-95 transition-transform"
        >
          🗑️ {t('settings_wipe')}
        </button>
      </section>

      {/* -------------------- Privacy -------------------- */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-2">
          🔒 {t('settings_privacy')}
        </h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          {t('settings_privacy_body')}
        </p>
      </section>

      {/* -------------------- About -------------------- */}
      <section className="bg-white rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-2">
          ℹ️ {t('settings_about')}
        </h2>
        <p className="text-sm text-gray-700 leading-relaxed">
          {t('settings_about_body')}
        </p>
        <p className="mt-3 text-xs text-gray-400">
          {t('app_name')} · v1.0 · {t('settings_notice')}
        </p>
      </section>

      {/* -------------------- Toast -------------------- */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40
                     bg-primary text-white text-sm px-4 py-2 rounded-full shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}