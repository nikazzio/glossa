import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { IconButton } from '../ui';
import { LibraryProfileEditor } from './LibraryProfileEditor';
import {
  cautiousNetworkProfile,
  listLibrarySettings,
  resetLibrarySettings,
  saveLibrarySettings,
  type LibrarySettings,
  type NetworkProfile,
} from '../../services/downloadSettingsService';

/**
 * Le biblioteche e come si sta al loro tavolo (#421, D18).
 *
 * L'elenco è quello del registro compilato nell'applicazione, più le voci
 * aggiunte a mano per un host che nel registro non c'è — che è il caso delle
 * fonti aggiunte per indirizzo diretto. Chi non è stato toccato mostra i
 * valori di fabbrica; chi lo è stato può tornarci.
 */
export function LibrariesSettingsTab() {
  const { t } = useTranslation();
  const [libraries, setLibraries] = useState<LibrarySettings[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [newHost, setNewHost] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLibraries(await listLibrarySettings());
      } catch (error: unknown) {
        toast.error(t('settings.libraries.loadFailed'), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void load();
  }, [t]);

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

  const addHost = async () => {
    const host = newHost.trim();
    if (host === '') return;
    try {
      // Si parte dal profilo prudente, che è quello che quella fonte sta già
      // usando: aggiungere la voce serve a cambiarlo, non a ripartire da zero.
      setLibraries(await saveLibrarySettings(host, null, await cautiousNetworkProfile()));
      setNewHost('');
      setOpenKey(host);
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
      className="flex flex-col gap-4"
    >
      <ul className="flex flex-col divide-y divide-editorial-border/60 rounded-md border border-editorial-border">
        {libraries.map((library) => {
          const open = openKey === library.key;
          return (
            <li key={library.key} className="flex flex-col">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-xs font-medium text-editorial-ink">
                  {library.label}
                  {library.customised && (
                    <span className="ml-2 text-[11px] text-editorial-muted">
                      {t('settings.libraries.changed')}
                    </span>
                  )}
                </span>
                <IconButton
                  size="sm"
                  onClick={() => setOpenKey(open ? null : library.key)}
                  title={open ? t('settings.libraries.collapse') : t('settings.libraries.expand')}
                  ariaPressed={open}
                >
                  {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </IconButton>
              </div>
              {open && (
                <LibraryProfileEditor
                  // Riaprire una biblioteca dopo un salvataggio deve ripartire
                  // dai valori appena scritti, non da quelli in memoria.
                  key={`${library.key}:${library.customised}`}
                  library={library}
                  onSave={(sizeCap, profile) => save(library.key, sizeCap, profile)}
                  onReset={() => reset(library.key)}
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 border-t border-editorial-border/60 pt-4">
        <input
          value={newHost}
          onChange={(event) => setNewHost(event.target.value)}
          placeholder={t('settings.libraries.hostPlaceholder')}
          aria-label={t('settings.libraries.hostField')}
          className="min-w-0 flex-1 rounded-md border border-editorial-border bg-editorial-textbox px-2 py-1.5 text-xs font-sans text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        />
        <IconButton
          size="sm"
          onClick={() => void addHost()}
          disabled={newHost.trim() === ''}
          title={t('settings.libraries.addHost')}
        >
          <Plus size={13} />
        </IconButton>
      </div>
      <p className="text-[11px] leading-relaxed text-editorial-muted">
        {t('settings.libraries.hostHint')}
      </p>
    </div>
  );
}
