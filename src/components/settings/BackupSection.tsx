import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Check, Copy, DatabaseBackup, Download, KeyRound, LockKeyhole, Upload } from 'lucide-react';
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

const MINIMUM_PASSWORD_LENGTH = 12;

function createRecoveryCode(): string {
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('-');
}

async function copyText(text: string): Promise<void> {
  if (window.navigator.clipboard?.writeText) {
    try {
      await window.navigator.clipboard.writeText(text);
      return;
    } catch {
      // WebKit può esporre l'API ma rifiutarla: sotto si usa il metodo locale.
    }
  }

  const temporaryInput = window.document.createElement('textarea');
  temporaryInput.value = text;
  temporaryInput.setAttribute('readonly', '');
  temporaryInput.style.position = 'fixed';
  temporaryInput.style.opacity = '0';
  window.document.body.appendChild(temporaryInput);
  let copied = false;
  try {
    temporaryInput.select();
    copied = window.document.execCommand('copy');
  } finally {
    temporaryInput.remove();
  }
  if (!copied) throw new Error('clipboard_unavailable');
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
  const [recoveryCodeCopied, setRecoveryCodeCopied] = useState(false);
  const passwordTooShort = password.length > 0 && password.length < MINIMUM_PASSWORD_LENGTH;
  const passwordsDiffer = passwordConfirmation.length > 0 && password !== passwordConfirmation;
  const passwordValid = password.length >= MINIMUM_PASSWORD_LENGTH
    && passwordConfirmation.length > 0
    && !passwordsDiffer;

  const updatePassword = (event: FormEvent<HTMLInputElement>) => {
    setPassword(event.currentTarget.value);
  };

  const updatePasswordConfirmation = (event: FormEvent<HTMLInputElement>) => {
    setPasswordConfirmation(event.currentTarget.value);
  };

  const copyRecoveryCode = async () => {
    if (!recoveryCode) return;
    try {
      await copyText(recoveryCode);
      setRecoveryCodeCopied(true);
      toast.success(t('settings.backupRecoveryCodeCopied'));
    } catch {
      toast.error(t('errors.clipboardFailed'));
    }
  };

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
        setRecoveryCodeCopied(false);
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
          <input aria-describedby={passwordTooShort ? 'backup-password-error' : undefined} aria-invalid={passwordTooShort} aria-label={t('settings.backupPasswordPlaceholder')} autoComplete="new-password" className={FIELD_CLASSNAME} onInput={updatePassword} placeholder={t('settings.backupPasswordPlaceholder')} type="password" value={password} />
          {passwordTooShort && <p id="backup-password-error" role="alert" className="text-xs text-editorial-danger">{t('settings.backupPasswordTooShort')}</p>}
          <input aria-describedby={passwordsDiffer ? 'backup-password-confirmation-error' : undefined} aria-invalid={passwordsDiffer} aria-label={t('settings.backupPasswordConfirmationPlaceholder')} autoComplete="new-password" className={FIELD_CLASSNAME} onInput={updatePasswordConfirmation} placeholder={t('settings.backupPasswordConfirmationPlaceholder')} type="password" value={passwordConfirmation} />
          {passwordsDiffer && <p id="backup-password-confirmation-error" role="alert" className="text-xs text-editorial-danger">{t('settings.backupPasswordMismatch')}</p>}
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
        footer={<div className="flex justify-end"><DialogConfirmButton onClick={() => { setRecoveryCodeCopied(false); setRecoveryCode(null); setDialog(null); }}>{t('settings.backupRecoveryCodeSaved')}</DialogConfirmButton></div>}
      >
        <div className="flex items-center gap-2">
          <input aria-label={t('settings.backupShowRecoveryCode')} className="min-w-0 flex-1 rounded border border-editorial-border bg-editorial-textbox px-3 py-2 font-mono text-sm text-editorial-ink" onFocus={(event) => event.currentTarget.select()} readOnly value={recoveryCode ?? ''} />
          <IconButton size="sm" title={t('settings.backupCopyRecoveryCode')} onClick={() => void copyRecoveryCode()}>
            {recoveryCodeCopied ? <Check size={13} /> : <Copy size={13} />}
          </IconButton>
        </div>
      </Dialog>
    </section>
  );
}
