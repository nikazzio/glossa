import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Tooltip } from '../ui';
import { LibraryProfileEditor } from './LibraryProfileEditor';
import {
  listLibrarySettings,
  resetLibrarySettings,
  saveLibrarySettings,
  type LibrarySettings,
  type NetworkProfile,
} from '../../services/downloadSettingsService';

/**
 * Le biblioteche e come si sta al loro tavolo (#421, D18).
 *
 * Stessa forma delle impostazioni dei provider: una fila di pulsanti con la
 * sola sigla e il nome al passaggio del mouse, e sotto i valori di quella
 * scelta. Le biblioteche sono undici: un elenco aperto sarebbe una parete di
 * numeri.
 */
export function LibrariesSettingsTab() {
  const { t } = useTranslation();
  const [libraries, setLibraries] = useState<LibrarySettings[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const listed = await listLibrarySettings();
        setLibraries(listed);
        setActiveKey((current) => current ?? listed[0]?.key ?? null);
      } catch (error: unknown) {
        toast.error(t('settings.libraries.loadFailed'), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void load();
  }, [t]);

  const active = libraries.find((library) => library.key === activeKey) ?? null;

  const save = async (key: string, sizeCap: string | null, profile: NetworkProfile) => {
    try {
      // L'elenco che torna è quello **davvero salvato**: se un valore è stato
      // riportato dentro i limiti, si vede subito quello che vale.
      setLibraries(await saveLibrarySettings(key, sizeCap, profile));
      toast.success(t('settings.libraries.saved'));
    } catch (error: unknown) {
      toast.error(t('settings.libraries.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const reset = async (key: string) => {
    try {
      setLibraries(await resetLibrarySettings(key));
      toast.success(t('settings.libraries.resetDone'));
    } catch (error: unknown) {
      toast.error(t('settings.libraries.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div
      id="settings-panel-libraries"
      role="tabpanel"
      aria-labelledby="settings-tab-libraries"
      className="space-y-4"
    >
      <p className="text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
        {t('settings.librariesTab')}
      </p>

      <div className="space-y-4 border-y border-editorial-border/70 py-5">
        <div role="tablist" aria-label={t('settings.librariesTab')} className="flex flex-wrap gap-2">
          {libraries.map((library) => {
            const active = library.key === activeKey;
            return (
              <Tooltip key={library.key} label={library.label}>
                <button
                  type="button"
                  onClick={() => setActiveKey(library.key)}
                  aria-label={library.label}
                  id={`settings-library-tab-${library.key}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls="settings-library-panel"
                  tabIndex={active ? 0 : -1}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-bold uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    active
                      ? 'border-editorial-accent bg-editorial-accent text-white'
                      : 'border-editorial-border bg-editorial-textbox/30 text-editorial-muted hover:border-editorial-accent/40 hover:text-editorial-accent'
                  }`}
                >
                  {monogram(library.label)}
                  {/* Una biblioteca con valori propri lo dice con un punto, non
                      con una parola: la fila resta una fila di sigle. */}
                  {library.customised && (
                    <span
                      className={`absolute mb-5 ml-5 h-1.5 w-1.5 rounded-full ${
                        active ? 'bg-white' : 'bg-editorial-accent'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                </button>
              </Tooltip>
            );
          })}

        </div>

        <div id="settings-library-panel" role="tabpanel" aria-labelledby={`settings-library-tab-${activeKey}`}>
          {active && (
            <LibraryProfileEditor
              // Riaprire una biblioteca dopo un salvataggio deve ripartire dai
              // valori appena scritti, non da quelli rimasti in memoria.
              key={`${active.key}:${active.customised}`}
              library={active}
              onSave={(sizeCap, profile) => save(active.key, sizeCap, profile)}
              onReset={() => reset(active.key)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Le due lettere che stanno in un pulsante tondo. Il nome intero è nel tooltip. */
function monogram(label: string): string {
  const words = label.split(/[\s.]+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`;
  return label.slice(0, 2);
}
