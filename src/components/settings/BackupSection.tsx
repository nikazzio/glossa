import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, DatabaseBackup, Download, Upload } from 'lucide-react';
import { IconButton } from '../ui';
import { writeBackup, restoreBackup } from '../../services/backupService';
import { enqueueVaultVerification } from '../../services/jobsService';
import { markRestoreCheck } from '../../services/restoreFollowUp';
import { logger } from '../../utils/logger';

/**
 * Il backup del programma intero (#345, #407, D31).
 *
 * Sta qui, accanto alla cartella dei dati e al deposito, perché è dello stesso
 * genere: dove stanno le cose e come si rimettono a posto. Prima era dentro le
 * impostazioni del workspace, e diceva di salvare quel workspace mentre in
 * realtà salvava tutto.
 *
 * Il file non contiene le immagini (D31): al ripristino si propone di
 * riprendere le opere che c'erano, altrimenti l'esclusione sarebbe una perdita
 * silenziosa.
 */
export function BackupSection() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handleWrite = async () => {
    setBusy(true);
    try {
      // Chiudere la finestra di salvataggio non è un successo: annunciarlo
      // farebbe credere di avere un backup che non esiste.
      const saved = await writeBackup();
      if (saved) toast.success(t('files.backupExportSuccess'));
    } catch (error: unknown) {
      toast.error(t('files.backupWriteFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    try {
      const restored = await restoreBackup(t);
      if (restored) {
        // Il ripristino ha rimesso le pagine che il programma aveva sul disco,
        // ma non sa se quei file ci sono davvero: il controllo lo dice, e solo
        // dopo si propone di riprendere quello che manca.
        try {
          const check = await enqueueVaultVerification(false);
          await markRestoreCheck({ jobId: check.id, downloaded: restored });
          toast.success(t('files.restoreCheckQueued'));
        } catch (error: unknown) {
          // Il ripristino è avvenuto: se il controllo non parte lo si dice,
          // invece di far credere che sia in corso qualcosa che non c'è.
          logger.warn('restore.check.not_queued', {
            error: error instanceof Error ? error.message : String(error),
          });
          toast.warning(t('files.restoreCheckFailed'));
        }
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // I motivi che il backend distingue si dicono a parole: «backup_truncated»
      // a schermo non aiuta nessuno.
      const key =
        {
          incompatible_schema_version: 'files.backupIncompatibleVersion',
          backup_truncated: 'files.backupTruncated',
          backup_format_too_new: 'files.backupTooNew',
          backup_unreadable: 'files.backupUnreadable',
          backup_manifest_missing: 'files.backupTruncated',
          backup_manifest_unreadable: 'files.backupTruncated',
          backup_payload_missing: 'files.backupTruncated',
          backup_schema_unreadable: 'files.backupSchemaUnreadable',
        }[message] ?? 'files.backupInvalidFile';
      // Il codice tecnico non va a schermo: se il motivo è uno di quelli che
      // sappiamo dire a parole, la frase basta e la descrizione sarebbe rumore.
      toast.error(t(key), key === 'files.backupInvalidFile' ? { description: message } : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 border-t border-editorial-border/60 pt-5">
      <div className="flex items-start gap-3">
        <DatabaseBackup size={16} className="mt-0.5 shrink-0 text-editorial-muted" />
        <p className="flex-1 text-[11px] font-sans uppercase tracking-[0.16em] text-editorial-muted">
          {t('settings.backup')}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-editorial-ink">
          <span className="text-editorial-accent"><Download size={13} /></span>
          <span>{t('settings.backupExport')}</span>
        </div>
        <IconButton
          size="sm"
          onClick={() => void handleWrite()}
          disabled={busy}
          title={t('settings.backupExportTooltip')}
        >
          <Download size={13} />
        </IconButton>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-editorial-ink">
          <span className="text-editorial-accent"><Upload size={13} /></span>
          <span>{t('settings.backupImport')}</span>
        </div>
        <IconButton
          size="sm"
          onClick={() => void handleRestore()}
          disabled={busy}
          title={t('settings.backupImportTooltip')}
        >
          <Upload size={13} />
        </IconButton>
      </div>

      <p className="text-[11px] leading-relaxed text-editorial-muted">{t('settings.backupHint')}</p>

      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-editorial-warning">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        {t('settings.backupScopeWarning')}
      </p>
    </section>
  );
}
