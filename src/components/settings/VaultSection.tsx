import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Archive, AlertTriangle, ScanSearch, ShieldCheck } from 'lucide-react';
import { IconButton, Spinner, ToggleRow, Tooltip } from '../ui';
import {
  chooseVaultFolder,
  getVaultStatus,
  getVerifyVaultOnStartup,
  setVerifyVaultOnStartup,
  adoptDefaultVaultFolder,
  type VaultStatus,
} from '../../services/vaultService';
import { enqueueVaultVerification } from '../../services/jobsService';

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
  const [verifyOnStartup, setVerifyOnStartup] = useState(false);

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
    void getVerifyVaultOnStartup().then(setVerifyOnStartup);
  }, [refresh]);

  const changeVerifyOnStartup = async (enabled: boolean) => {
    // Ottimistico, ma con il ritorno indietro: un interruttore che resta acceso
    // mentre l'impostazione non è stata scritta è una bugia che si scopre solo
    // al riavvio successivo.
    setVerifyOnStartup(enabled);
    try {
      await setVerifyVaultOnStartup(enabled);
    } catch (error: unknown) {
      setVerifyOnStartup(!enabled);
      toast.error(t('settings.storage.vault.verifyOnStartupFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /**
   * La verifica del deposito è un lavoro (D5-bis): si mette in coda e si guarda
   * nel pannello, come tutto il resto. Quella completa apre ogni file, quindi su
   * un deposito sincronizzato costringe il client a scaricare tutto (D1-bis) —
   * per questo è una voce a parte e non il comportamento predefinito.
   */
  const startVerification = async (full: boolean) => {
    setBusy(true);
    try {
      await enqueueVaultVerification(full);
      toast.success(t('settings.storage.vault.verificationQueued'));
    } catch (error: unknown) {
      toast.error(t('settings.storage.vault.verificationFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

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
        <p className="flex-1 text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
          {t('settings.storage.vault.title')}
        </p>
      </div>

      {/* La scheda **è** il comando: cliccarla apre la scelta della cartella.
          Un pulsante separato ripeterebbe la stessa azione occupando spazio. */}
      <Tooltip label={t('settings.storage.vault.chooseFolder')} side="top">
        <button
          type="button"
          onClick={() => void handleChoose()}
          disabled={busy || loading}
          aria-label={t('settings.storage.vault.chooseFolder')}
          className="w-full rounded-2xl border border-editorial-border bg-surface-panel px-4 py-3 text-left transition-colors hover:border-editorial-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
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
        </button>
      </Tooltip>

      {syncWarning && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-editorial-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {t('settings.storage.vault.syncWarning')}
        </p>
      )}

      <div className="flex flex-col gap-3 border-t border-editorial-border/60 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-editorial-ink">
            <span className="text-editorial-accent"><ShieldCheck size={13} /></span>
            <span>{t('settings.storage.vault.verifyQuick')}</span>
          </div>
          <IconButton
            size="sm"
            onClick={() => void startVerification(false)}
            disabled={busy || loading || !status?.reachable}
            title={t('settings.storage.vault.verifyQuickTooltip')}
          >
            <ShieldCheck size={13} />
          </IconButton>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-editorial-ink">
            <span className="text-editorial-accent"><ScanSearch size={13} /></span>
            <span>{t('settings.storage.vault.verifyFull')}</span>
          </div>
          <IconButton
            size="sm"
            onClick={() => void startVerification(true)}
            disabled={busy || loading || !status?.reachable}
            title={t('settings.storage.vault.verifyFullTooltip')}
          >
            <ScanSearch size={13} />
          </IconButton>
        </div>
        <p className="text-[11px] leading-relaxed text-editorial-muted">
          {t('settings.storage.vault.verifyHint')}
        </p>

        <ToggleRow
          icon={<ShieldCheck size={13} />}
          label={t('settings.storage.vault.verifyOnStartup')}
          checked={verifyOnStartup}
          disabled={busy}
          onChange={() => void changeVerifyOnStartup(!verifyOnStartup)}
        />
      </div>

      {!status?.isDefault && (
        <button
          type="button"
          onClick={() => void handleDefault()}
          disabled={busy || loading}
          className="self-start text-xs text-editorial-muted underline-offset-4 transition-colors hover:text-editorial-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
        >
          {t('settings.storage.vault.keepTogether')}
        </button>
      )}
    </section>
  );
}
