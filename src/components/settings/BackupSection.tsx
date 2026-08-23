import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, DatabaseBackup, Download, KeyRound, LockKeyhole, Upload } from 'lucide-react';
import {
  Dialog,
  DialogCancelButton,
  DialogConfirmButton,
  FIELD_CLASSNAME,
  IconButton,
  SectionLabel,
  SettingRow,
} from '../ui';
import { writeBackup, restoreBackup } from '../../services/backupService';
import { enqueueVaultVerification } from '../../services/jobsService';
import { markRestoreCheck } from '../../services/restoreFollowUp';
import { logger } from '../../utils/logger';

type BackupDialog = 'create' | 'restore' | 'recovery' | null;

function createRecoveryCode(): string {
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('-');
}

/** Backup completo dell'applicazione, distinto dalle esportazioni di lavoro. */
export function BackupSection() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<BackupDialog>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [restoreSecret, setRestoreSecret] = useState('');
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const passwordValid = password.length >= 12 && password === passwordConfirmation;

  const closeDialog = () => {
    if (busy || dialog === 'recovery') return;
    setDialog(null);
  };

  const finishRestore = async (secret?: string) => {
    const restored = await restoreBackup(t, secret);
    if (!restored) return;
    try {
      const check = await enqueueVaultVerification(false);
      await markRestoreCheck({ jobId: check.id, downloaded: restored });
      toast.success(t('files.restoreCheckQueued'));
    } catch (error: unknown) {
      logger.warn('restore.check.not_queued', {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.warning(t('files.restoreCheckFailed'));
    }
    setTimeout(() => window.location.reload(), 1500);
  };

  const handleWrite = async (encrypted: boolean) => {
    if (encrypted && !passwordValid) return;
    setBusy(true);
    try {
      const code = encrypted ? createRecoveryCode() : undefined;
      const saved = await writeBackup(encrypted
        ? { privacy: 'password', password, recoveryCode: code }
        : { privacy: 'glossaOnly' });
      if (!saved) return;
      toast.success(t('files.backupExportSuccess'));
      setPassword('');
      setPasswordConfirmation('');
      if (code) {
        setRecoveryCode(code);
        setDialog('recovery');
      } else {
        setDialog(null);
      }
    } catch (error: unknown) {
      toast.error(t('files.backupWriteFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (secret?: string) => {
    setBusy(true);
    try {
      await finishRestore(secret);
      setRestoreSecret('');
      setDialog(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const key = {
        incompatible_schema_version: 'files.backupIncompatibleVersion',
        backup_truncated: 'files.backupTruncated',
        backup_format_too_new: 'files.backupTooNew',
        backup_unreadable: 'files.backupUnreadable',
        backup_manifest_missing: 'files.backupTruncated',
        backup_manifest_unreadable: 'files.backupTruncated',
        backup_payload_missing: 'files.backupTruncated',
        backup_schema_unreadable: 'files.backupSchemaUnreadable',
        backup_wrong_password: 'files.backupWrongPassword',
        backup_corrupt: 'files.backupCorrupt',
        backup_password_required: 'files.backupPasswordRequired',
      }[message] ?? 'files.backupInvalidFile';
      toast.error(t(key), key === 'files.backupInvalidFile' ? { description: message } : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <SectionLabel icon={DatabaseBackup} label={t('settings.backup')} />

      <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
        <SettingRow label={t('settings.backupExport')} hint={t('settings.backupHint')}>
          <div className="flex items-center gap-1">
            <IconButton size="sm" onClick={() => void handleWrite(false)} disabled={busy} title={t('settings.backupExportTooltip')}>
              <Download size={13} />
            </IconButton>
            <IconButton size="sm" onClick={() => setDialog('create')} disabled={busy} title={t('settings.backupEncryptedExportTooltip')}>
              <LockKeyhole size={13} />
            </IconButton>
          </div>
        </SettingRow>

        <SettingRow label={t('settings.backupImport')}>
          <div className="flex items-center gap-1">
            <IconButton size="sm" onClick={() => void handleRestore()} disabled={busy} title={t('settings.backupImportTooltip')}>
              <Upload size={13} />
            </IconButton>
            <IconButton size="sm" onClick={() => setDialog('restore')} disabled={busy} title={t('settings.backupEncryptedImportTooltip')}>
              <KeyRound size={13} />
            </IconButton>
          </div>
        </SettingRow>
      </div>

      <p className="flex items-start gap-2 text-sm leading-relaxed text-editorial-warning">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        {t('settings.backupScopeWarning')}
      </p>

      <Dialog
        open={dialog === 'create'}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
        title={t('settings.backupEncryptedCreateTitle')}
        closeLabel={t('common.close')}
        icon={<LockKeyhole size={20} />}
        widthClassName="max-w-md"
        bodyClassName="px-6 py-5"
        closeDisabled={busy}
        footer={<div className="flex justify-end gap-3"><DialogCancelButton onClick={closeDialog} disabled={busy}>{t('common.cancel')}</DialogCancelButton><DialogConfirmButton onClick={() => void handleWrite(true)} disabled={busy || !passwordValid}>{t('settings.backupSaveEncrypted')}</DialogConfirmButton></div>}
      >
        <div className="grid gap-3">
          <input aria-label={t('settings.backupPasswordPlaceholder')} autoComplete="new-password" className={FIELD_CLASSNAME} onChange={(event) => setPassword(event.target.value)} placeholder={t('settings.backupPasswordPlaceholder')} type="password" value={password} />
          <input aria-label={t('settings.backupPasswordConfirmationPlaceholder')} autoComplete="new-password" className={FIELD_CLASSNAME} onChange={(event) => setPasswordConfirmation(event.target.value)} placeholder={t('settings.backupPasswordConfirmationPlaceholder')} type="password" value={passwordConfirmation} />
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'restore'}
        onOpenChange={(open) => { if (!open) closeDialog(); }}
        title={t('settings.backupEncryptedRestoreTitle')}
        closeLabel={t('common.close')}
        icon={<KeyRound size={20} />}
        widthClassName="max-w-md"
        bodyClassName="px-6 py-5"
        closeDisabled={busy}
        footer={<div className="flex justify-end gap-3"><DialogCancelButton onClick={closeDialog} disabled={busy}>{t('common.cancel')}</DialogCancelButton><DialogConfirmButton onClick={() => void handleRestore(restoreSecret)} disabled={busy || !restoreSecret}>{t('settings.backupChooseFile')}</DialogConfirmButton></div>}
      >
        <input aria-label={t('settings.backupSecretPlaceholder')} autoComplete="current-password" className={FIELD_CLASSNAME} onChange={(event) => setRestoreSecret(event.target.value)} placeholder={t('settings.backupSecretPlaceholder')} type="password" value={restoreSecret} />
      </Dialog>

      <Dialog
        open={dialog === 'recovery' && recoveryCode !== null}
        onOpenChange={() => undefined}
        title={t('settings.backupShowRecoveryCode')}
        closeLabel={t('common.close')}
        icon={<KeyRound size={20} />}
        widthClassName="max-w-md"
        bodyClassName="px-6 py-5"
        closeDisabled
        footer={<div className="flex justify-end"><DialogConfirmButton onClick={() => { setRecoveryCode(null); setDialog(null); }}>{t('settings.backupRecoveryCodeSaved')}</DialogConfirmButton></div>}
      >
        <code className="block select-all break-all rounded border border-editorial-border bg-editorial-textbox px-3 py-2 font-mono text-sm text-editorial-ink">{recoveryCode}</code>
      </Dialog>
    </section>
  );
}
