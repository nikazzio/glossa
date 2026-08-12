import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Archive, AlertTriangle } from 'lucide-react';
import { PillButton, Spinner } from '../ui';
import {
  chooseVaultFolder,
  getVaultStatus,
  adoptDefaultVaultFolder,
  type VaultStatus,
} from '../../services/vaultService';

/**
 * La cartella del deposito, distinta dalla cartella dati (D1).
 *
 * Il database resta dov'è; le immagini e i documenti possono andare su un'altra
 * partizione, un disco esterno o una cartella sincronizzata. Separarli protegge
 * il database: chi vuole le immagini sul cloud non è più costretto a portarci
 * anche SQLite, che lì si corrompe.
 *
 * La finestra di scelta la apre il **backend**: il percorso non attraversa
 * l'interfaccia e nessun comando lo accetta come parametro (come l'import dopo
 * #405).
 */
export function VaultSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncWarning, setSyncWarning] = useState(false);

  // `t` cambia identità a ogni render con alcune configurazioni di i18n: se
  // entrasse fra le dipendenze, l'effetto si rilancerebbe all'infinito e lo
  // stato del deposito verrebbe riletto di continuo.
  const tRef = useRef(t);
  tRef.current = t;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getVaultStatus());
    } catch (error: unknown) {
      toast.error(tRef.current('settings.storage.vault.loadFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleChoose = async () => {
    setBusy(true);
    try {
      const choice = await chooseVaultFolder();
      if (!choice) return;
      if (!choice.adopted) {
        // Cartella con altro contenuto o non scrivibile: si rifiuta, invece di
        // riversarci dentro migliaia di file (D1).
        toast.error(
          choice.writable
            ? t('settings.storage.vault.folderNotEmpty')
            : t('settings.storage.vault.folderNotWritable'),
        );
        return;
      }
      setSyncWarning(choice.syncFolder);
      toast.success(t('settings.storage.vault.adopted'));
      await refresh();
    } catch (error: unknown) {
      toast.error(t('settings.storage.vault.chooseFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDefault = async () => {
    setBusy(true);
    try {
      setStatus(await adoptDefaultVaultFolder());
      setSyncWarning(false);
      toast.success(t('settings.storage.vault.adopted'));
    } catch (error: unknown) {
      toast.error(t('settings.storage.vault.chooseFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 border-t border-editorial-border/60 pt-5">
      <div className="flex items-start gap-3">
        <Archive size={16} className="mt-0.5 shrink-0 text-editorial-muted" />
        <div className="flex-1">
          <p className="font-display text-sm text-editorial-ink">{t('settings.storage.vault.title')}</p>
          <p className="mt-1 text-xs leading-relaxed text-editorial-muted">
            {t('settings.storage.vault.description')}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-editorial-border bg-surface-panel px-4 py-3">
        <p className="text-xs font-mono text-editorial-muted">
          {status?.isDefault
            ? t('settings.storage.vault.defaultLocation')
            : t('settings.storage.vault.customLocation')}
        </p>
        {loading ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-editorial-muted">
            <Spinner size={14} />
            {t('common.loading')}
          </div>
        ) : (
          <>
            <p className="mt-1 break-all font-mono text-sm text-editorial-ink">{status?.path}</p>
            {status && !status.reachable && (
              // Disco staccato o cartella non ancora sincronizzata: è un caso
              // diverso da "i file non ci sono" (D1), e va detto così.
              <p className="mt-2 flex items-center gap-2 text-xs text-editorial-warning">
                <AlertTriangle size={13} />
                {t('settings.storage.vault.unreachable')}
              </p>
            )}
          </>
        )}
      </div>

      {syncWarning && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-editorial-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {t('settings.storage.vault.syncWarning')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <PillButton onClick={() => void handleChoose()} disabled={busy || loading}>
          {t('settings.storage.vault.chooseFolder')}
        </PillButton>
        {!status?.isDefault && (
          <PillButton onClick={() => void handleDefault()} disabled={busy || loading}>
            {t('settings.storage.vault.keepTogether')}
          </PillButton>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-editorial-muted">
        {t('settings.storage.vault.moveNote')}
      </p>
    </section>
  );
}
