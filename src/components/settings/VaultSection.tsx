import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Archive, AlertTriangle, FolderTree, ScanSearch, ShieldCheck, Trash2 } from 'lucide-react';
import { IconButton, SectionLabel, SettingRow, Spinner, ToggleRow, Tooltip } from '../ui';
import {
  chooseVaultFolder,
  deleteVaultOrphans,
  getVaultStatus,
  getVerifyVaultOnStartup,
  lastVaultCheck,
  setVerifyVaultOnStartup,
  adoptDefaultVaultFolder,
  type VaultCheckOutcome,
  type VaultStatus,
} from '../../services/vaultService';
import { enqueueVaultVerification, isTerminal } from '../../services/jobsService';
import { useJobsStore } from '../../stores/jobsStore';
import { confirm } from '../../stores/confirmStore';
import { humanSize } from '../../utils';

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
  const [check, setCheck] = useState<VaultCheckOutcome | null>(null);

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

  const refreshCheck = useCallback(() => {
    void lastVaultCheck().then(setCheck);
  }, []);

  useEffect(() => {
    void refresh();
    void getVerifyVaultOnStartup().then(setVerifyOnStartup);
    refreshCheck();
    // L'esito si rilegge **quando un controllo finisce**, non a ogni evento
    // della coda: chi l'ha appena lanciato sta guardando questa schermata, e
    // aspettare di riaprirla sarebbe assurdo.
    let lastSeen = '';
    return useJobsStore.subscribe((state) => {
      const finished = state.jobs
        .filter((job) => job.jobType === 'vault_verification' && isTerminal(job))
        .map((job) => `${job.id}@${job.updatedAt ?? ''}`)
        .join('|');
      if (finished === lastSeen) return;
      lastSeen = finished;
      refreshCheck();
    });
  }, [refresh, refreshCheck]);

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

  /**
   * Cancella i file che nessuna opera reclama (D5-bis).
   *
   * Il conto mostrato è quello dell'ultimo controllo; il backend riguarda il
   * deposito adesso e dice quanti ne ha tolti davvero, che può essere di meno:
   * fra il controllo e questo momento uno scaricamento può averne riconquistati.
   */
  const removeOrphans = async () => {
    if (!check || check.orphans === 0) return;
    const ok = await confirm({
      title: t('settings.storage.vault.deleteOrphansTitle'),
      message: t('settings.storage.vault.deleteOrphansMessage', {
        count: check.orphans,
        size: humanSize(check.orphanBytes),
      }),
      confirmLabel: t('settings.storage.vault.deleteOrphansConfirm'),
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const freed = await deleteVaultOrphans();
      toast.success(
        t('settings.storage.vault.orphansDeleted', {
          count: freed.deletedFiles,
          size: humanSize(freed.freedBytes),
        }),
      );
      // Il conto vecchio non vale più: si azzera invece di lasciarlo lì a
      // invitare una seconda cancellazione che non ha più niente da togliere.
      setCheck({ ...check, orphans: 0, orphanBytes: 0 });
    } catch (error: unknown) {
      toast.error(t('settings.storage.vault.orphansDeleteFailed'), {
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
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel icon={Archive} label={t('settings.storage.vault.title')} />
        {/* «Tieni tutto insieme» è un comando come gli altri: icona e tooltip,
            accanto alla sezione su cui agisce. Era un pulsante testuale
            sottolineato, l'unico della finestra. */}
        {!status?.isDefault && (
          <IconButton
            size="sm"
            onClick={() => void handleDefault()}
            disabled={busy || loading}
            title={t('settings.storage.vault.keepTogether')}
          >
            <FolderTree size={13} />
          </IconButton>
        )}
      </div>

      {/* La riga **è** il comando: cliccarla apre la scelta della cartella.
          Un pulsante separato ripeterebbe la stessa azione occupando spazio. */}
      <Tooltip label={t('settings.storage.vault.chooseFolder')} side="top">
        <button
          type="button"
          onClick={() => void handleChoose()}
          disabled={busy || loading}
          aria-label={t('settings.storage.vault.chooseFolder')}
          className="w-full border-y border-editorial-border/70 py-3 text-left transition-colors hover:bg-surface-hover/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <p className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
            {status?.isDefault
              ? t('settings.storage.vault.defaultLocation')
              : t('settings.storage.vault.customLocation')}
          </p>
          {loading ? (
            <div className="mt-1.5 flex items-center gap-2 text-sm text-editorial-muted">
              <Spinner size={14} />
              {t('common.loading')}
            </div>
          ) : (
            <>
              <p className="mt-1 break-all font-mono text-sm text-editorial-ink">{status?.path}</p>
              {status && !status.reachable && (
                // Disco staccato o cartella non ancora sincronizzata: è un caso
                // diverso da "i file non ci sono" (D1), e va detto così.
                <p className="mt-2 flex items-center gap-2 text-sm text-editorial-warning">
                  <AlertTriangle size={13} className="shrink-0" />
                  {t('settings.storage.vault.unreachable')}
                </p>
              )}
            </>
          )}
        </button>
      </Tooltip>

      {syncWarning && (
        <p className="flex items-start gap-2 text-sm leading-relaxed text-editorial-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {t('settings.storage.vault.syncWarning')}
        </p>
      )}

      <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
        <SettingRow
          label={t('settings.storage.vault.verifyQuick')}
          hint={t('settings.storage.vault.verifyHint')}
        >
          <IconButton
            size="sm"
            onClick={() => void startVerification(false)}
            disabled={busy || loading || !status?.reachable}
            title={t('settings.storage.vault.verifyQuickTooltip')}
          >
            <ShieldCheck size={13} />
          </IconButton>
        </SettingRow>

        <SettingRow
          label={t('settings.storage.vault.verifyFull')}
          hint={t('settings.storage.vault.verifyHint')}
        >
          <IconButton
            size="sm"
            onClick={() => void startVerification(true)}
            disabled={busy || loading || !status?.reachable}
            title={t('settings.storage.vault.verifyFullTooltip')}
          >
            <ScanSearch size={13} />
          </IconButton>
        </SettingRow>

        <ToggleRow
          icon={<ShieldCheck size={13} />}
          label={t('settings.storage.vault.verifyOnStartup')}
          checked={verifyOnStartup}
          disabled={busy}
          onChange={() => void changeVerifyOnStartup(!verifyOnStartup)}
        />
      </div>

      {/* L'esito dell'ultimo controllo resta qui finché non se ne fa un altro:
          prima viveva nella riga del pannello dei Lavori e dopo un giorno
          spariva, quindi «com'era andata» non aveva più risposta. */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">
            {t('settings.storage.vault.lastCheck')}
          </span>
          <span className="font-mono text-[11px] text-editorial-muted">
            {check?.at
              ? `${new Date(check.at.replace(' ', 'T') + 'Z').toLocaleString(undefined, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  hour12: false,
                })} · ${t(check.full ? 'settings.storage.vault.levelFull' : 'settings.storage.vault.levelQuick')}`
              : t('settings.storage.vault.lastCheckNever')}
          </span>
        </div>

        {check && (
          <>
            <p
              className={`text-sm ${
                check.missing + check.corrupt > 0 ? 'text-editorial-warning' : 'text-editorial-ink'
              }`}
            >
              {t('settings.storage.vault.lastCheckCounts', {
                intact: check.intact,
                missing: check.missing,
                corrupt: check.corrupt,
              })}
            </p>

            <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
              <SettingRow
                label={
                  check.orphans > 0
                    ? t('settings.storage.vault.orphanFiles', {
                        count: check.orphans,
                        size: humanSize(check.orphanBytes),
                      })
                    : t('settings.storage.vault.orphanFilesNone')
                }
              >
                <IconButton
                  size="sm"
                  tone="danger"
                  onClick={() => void removeOrphans()}
                  disabled={busy || loading || check.orphans === 0}
                  title={t('settings.storage.vault.deleteOrphans')}
                >
                  <Trash2 size={13} />
                </IconButton>
              </SettingRow>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
