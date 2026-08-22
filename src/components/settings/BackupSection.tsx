import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, DatabaseBackup, Download, Upload } from 'lucide-react';
import { IconButton, SectionLabel, SettingRow } from '../ui';
import { writeBackup, restoreBackup } from '../../services/backupService';
import { enqueueVaultVerification } from '../../services/jobsService';
import { markRestoreCheck } from '../../services/restoreFollowUp';
import { logger } from '../../utils/logger';

/**
 * Il backup del programma intero (#345, #407).
 *
 * Sta qui, accanto alla cartella dei dati e al deposito, perché è dello stesso
 * genere: dove stanno le cose e come si rimettono a posto. Prima era dentro le
 * impostazioni del workspace, e diceva di salvare quel workspace mentre in
 * realtà salvava tutto.
 *
 * Il file non contiene le immagini: al ripristino si propone di
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
    <section className="space-y-4">
      <SectionLabel icon={DatabaseBackup} label={t('settings.backup')} />

      {/* Una sola icona per riga, a destra, dove si clicca: la stessa icona
          ripetuta anche a sinistra faceva sembrare due comandi uno. */}
      <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
        <SettingRow label={t('settings.backupExport')} hint={t('settings.backupHint')}>
          <IconButton
            size="sm"
            onClick={() => void handleWrite()}
            disabled={busy}
            title={t('settings.backupExportTooltip')}
          >
            <Download size={13} />
          </IconButton>
        </SettingRow>

        {/* Nessun suggerimento al passaggio del mouse: la conseguenza del
            ripristino sta scritta sotto, a schermo. */}
        <SettingRow label={t('settings.backupImport')}>
          <IconButton
            size="sm"
            onClick={() => void handleRestore()}
            disabled={busy}
            title={t('settings.backupImportTooltip')}
          >
            <Upload size={13} />
          </IconButton>
        </SettingRow>
      </div>

      {/* Che il ripristino sostituisca tutto va detto a schermo, non solo al
          passaggio del mouse: è la conseguenza che non si può scoprire dopo. */}
      <p className="flex items-start gap-2 text-sm leading-relaxed text-editorial-warning">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        {t('settings.backupScopeWarning')}
      </p>
    </section>
  );
}
