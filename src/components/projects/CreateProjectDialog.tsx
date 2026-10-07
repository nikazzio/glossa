import { reportUiError } from '../../utils/reportUiError';
import { useEffect, useState } from 'react';
import { BookOpenText, FileUp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { importErrorMessageKey, importTextFile, type ImportedTextFile } from '../../services/fileService';
import { listProjectSourceVersions, type ProjectSourceVersion } from '../../services/projectService';
import { Dialog, DialogCancelButton, DialogConfirmButton, IconButton, SearchPicker, Select, SettingRow, Tooltip, type SearchPickerGroup } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  /** Workspace già noto dal chiamante (es. pagina di un workspace aperto). Se assente, l'utente sceglie da un elenco — mai dedotto da un residuo di navigazione. */
  workspaceId?: string;
}

const LABEL_CLASSNAME = 'text-xs font-bold uppercase tracking-caption text-editorial-muted';

/**
 * Dialog di creazione progetto: nome, workspace e, se si vuole, già il file da
 * tradurre. Il file si legge appena scelto, così un file illeggibile si scopre
 * qui e non si crea nulla; a creazione fatta la traduzione si apre e il file
 * passa all'anteprima dell'import.
 */
export function CreateProjectDialog({ open, onClose, workspaceId }: CreateProjectDialogProps) {
  const { t } = useTranslation();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const createAndOpen = useProjectStore((s) => s.createAndOpen);
  const setPendingImportFile = useUiStore((s) => s.setPendingImportFile);

  const [name, setName] = useState('');
  const [sources, setSources] = useState<ProjectSourceVersion[]>([]);
  const [sourceVersionId, setSourceVersionId] = useState('');
  const [sourcesFailed, setSourcesFailed] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(workspaceId ?? null);
  const [file, setFile] = useState<ImportedTextFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedWorkspaceId((current) => {
      if (workspaceId) return workspaceId;
      if (current && workspaces.some((workspace) => workspace.id === current)) return current;
      return workspaces[0]?.id ?? null;
    });
  }, [open, workspaceId, workspaces]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSourcesFailed(false);
    void listProjectSourceVersions().then((loaded) => { if (!cancelled) setSources(loaded); })
      .catch((error: unknown) => { if (!cancelled) { setSourcesFailed(true); reportUiError(t('projects.sourceBookLoadError'), error); } });
    return () => { cancelled = true; };
  }, [open, t]);

  const close = () => {
    setName('');
    setSourceVersionId('');
    setFile(null);
    setFileError(null);
    onClose();
  };

  const chooseFile = async () => {
    setReadingFile(true);
    try {
      const imported = await importTextFile();
      if (!imported) return;
      setFile(imported);
      setFileError(null);
    } catch (err: unknown) {
      setFile(null);
      setFileError(t(importErrorMessageKey(err instanceof Error ? err.message : String(err))));
    } finally {
      setReadingFile(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !selectedWorkspaceId || readingFile) return;
    setCreating(true);
    try {
      await createAndOpen(name.trim(), selectedWorkspaceId, sourceVersionId || undefined);
      if (file) setPendingImportFile(file);
      close();
    } catch (err: unknown) {
      reportUiError(t('projects.saveFailed'), err);
    } finally {
      setCreating(false);
    }
  };

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) close();
      }}
      title={t('projects.create')}
      eyebrow={selectedWorkspace?.name ?? t('workspace.noActive')}
      closeLabel={t('common.cancel')}
      icon={<BookOpenText size={22} />}
      widthClassName="max-w-lg"
      bodyClassName="px-6 py-6 md:px-8"
      footer={
        <div className="flex justify-end gap-2">
          <DialogCancelButton onClick={close}>{t('common.cancel')}</DialogCancelButton>
          <DialogConfirmButton onClick={() => void handleCreate()} disabled={!name.trim() || !selectedWorkspaceId || creating || readingFile}>
            {creating ? t('workspace.saving') : t('projects.create')}
          </DialogConfirmButton>
        </div>
      }
    >
      <div className="space-y-4">
        {!workspaceId && (
          <label className="block space-y-1.5">
            <span className={LABEL_CLASSNAME}>{t('projects.chooseWorkspace')}</span>
            <Select
              value={selectedWorkspaceId ?? ''}
              onChange={setSelectedWorkspaceId}
              options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
              ariaLabel={t('projects.chooseWorkspace')}
              className="w-full"
            />
          </label>
        )}
        <label className="block space-y-1.5">
          <span className={LABEL_CLASSNAME}>{t('workspace.newBookCard')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
              if (e.key === 'Escape') close();
            }}
            placeholder={t('projects.namePlaceholder')}
            className={FIELD_CLASSNAME}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- campo che compare da un click esplicito (nuovo progetto)
            autoFocus
          />
        </label>
        <div className="border-y border-rule">
          <SettingRow label={t('projects.sourceBook')} hint={t('projects.sourceBookHint')}>
            <ChosenBook source={sources.find((source) => source.id === sourceVersionId)} />
            <SearchPicker icon={<BookOpenText size={14} />} title={t('projects.chooseSourceBook')}
              disabled={creating || sourcesFailed || sources.length === 0} searchLabel={t('projects.searchSourceBook')}
              search={(query) => searchBooks(sources, query, t('projects.sourceBookGroup'))}
              noResults={t('projects.noSourceBookFound')} onPick={setSourceVersionId} />
            <IconButton size="sm" title={t('projects.clearSourceBook')} disabled={creating || !sourceVersionId}
              onClick={() => setSourceVersionId('')}><X size={14} /></IconButton>
          </SettingRow>
        </div>
        <div className="space-y-1.5">
          <span className={LABEL_CLASSNAME}>{t('projects.sourceFile')}</span>
          <div className="flex items-center gap-2">
            <IconButton size="md" onClick={() => void chooseFile()} disabled={readingFile || creating}
              title={t(file ? 'projects.changeSourceFile' : 'projects.chooseSourceFile')}>
              <FileUp size={14} />
            </IconButton>
            <span className={`min-w-0 flex-1 truncate text-sm ${file ? 'text-editorial-ink' : 'text-editorial-muted'}`}>
              {readingFile ? t('projects.readingSourceFile') : file?.name ?? t('projects.noSourceFile')}
            </span>
            {file && (
              <IconButton size="sm" tone="muted" onClick={() => setFile(null)} disabled={creating}
                title={t('projects.removeSourceFile')}>
                <X size={12} />
              </IconButton>
            )}
          </div>
          {fileError && <p role="alert" className="text-xs text-editorial-danger">{fileError}</p>}
        </div>
      </div>
    </Dialog>
  );
}

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Books whose title or copy contains the query, in one group. */
function searchBooks(sources: ProjectSourceVersion[], rawQuery: string, groupLabel: string): SearchPickerGroup[] {
  const query = normalize(rawQuery.trim());
  const items = sources
    .filter((source) => !query || normalize(`${source.title} ${source.label}`).includes(query))
    .map((source) => ({ id: source.id, label: source.title, detail: source.label }));
  return [{ id: 'books', label: groupLabel, items }];
}

/** Il libro scelto: titolo troncato con il testo intero nel suggerimento, mai una riga che allarga la finestra. */
function ChosenBook({ source }: { source: ProjectSourceVersion | undefined }) {
  const { t } = useTranslation();
  if (!source) return <span className="text-sm italic text-editorial-muted">{t('memory.provenance.noBook')}</span>;
  return (
    <Tooltip label={`${source.title} — ${source.label}`}>
      <span className="block max-w-48 truncate font-display text-base italic text-editorial-ink">{source.title}</span>
    </Tooltip>
  );
}
