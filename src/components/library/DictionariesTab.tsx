import { reportUiError } from '../../utils/reportUiError';
import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Download, Loader2, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLibraryStore } from '../../stores/libraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { assignGlossaryToProject, getGlossaryEntries, isGlossaryHome } from '../../services/glossaryService';
import { confirm } from '../../stores/confirmStore';
import type { Glossary } from '../../types';
import { CatalogSearchField, Hint, IconButton, RenameField, Select, Spinner, StatRow } from '../ui';
import { FIELD_INLINE_CLASSNAME } from '../ui/fieldStyles';
import { DictionaryEntryEditor } from './DictionaryEntryEditor';
import { CsvImportDialog } from './CsvImportDialog';
import { CopyGlossaryDialog } from './CopyGlossaryDialog';
import { DictionaryExportDialog } from './DictionaryExportDialog';
import { ResourceWorkspaceFilter } from './ResourceWorkspaceFilter';
import { WorkspaceIdentity } from '../workspace/WorkspaceIdentity';

export function DictionariesTab({ onEditingChange, onBusyChange }: { onEditingChange?: (value: boolean) => void; onBusyChange?: (value: boolean) => void } = {}) {
  const { t } = useTranslation();
  const store = useLibraryStore();
  const { loadGlossaries, loadGlossaryEntries, expandedGlossaryId } = store;
  const { activeWorkspace, workspaces } = useWorkspaceStore();
  const { config, assignGlossary } = usePipelineStore();
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const global = store.libraryScope === 'global';
  const scope = global ? null : activeWorkspace?.id ?? null;
  const [workspaceFilter, setWorkspaceFilter] = useState('all');
  const destination = global ? workspaces.find((workspace) => workspace.id === workspaceFilter)?.id : activeWorkspace?.id;
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [entryError, setEntryError] = useState(false);
  const [localOverride, setLocalOverride] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [createWorkspace, setCreateWorkspace] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [exporting, setExporting] = useState<Glossary | null>(null);
  useEffect(() => { onEditingChange?.(creating || renaming !== null); return () => onEditingChange?.(false); }, [creating, renaming, onEditingChange]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    const filter = global && workspaceFilter !== 'all' && workspaceFilter !== 'none' ? workspaceFilter : scope;
    void loadGlossaries(filter).catch((error: unknown) => {
      if (!cancelled) { setLoadFailed(true); reportUiError(t('library.dictionaryLoadError'), error); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [global, scope, workspaceFilter, loadGlossaries, t]);

  // Una nuova apertura rilegge anche la vista delle voci: la precedente può
  // provenire dal workspace e contenere correzioni, oppure dagli originali.
  useEffect(() => {
    const id = expandedGlossaryId;
    if (!id) return;
    let cancelled = false;
    setLoadingEntries(true);
    setEntryError(false);
    Promise.all([loadGlossaryEntries(id, scope), scope ? isGlossaryHome(id, scope) : Promise.resolve(true)])
      .then(([, home]) => { if (!cancelled) setLocalOverride(!home); })
      .catch((error: unknown) => { if (!cancelled) { setEntryError(true); reportUiError(t('library.dictionaryLoadError'), error); } })
      .finally(() => { if (!cancelled) setLoadingEntries(false); });
    return () => { cancelled = true; };
  }, [expandedGlossaryId, loadGlossaryEntries, scope, t]);

  const run = async (operation: () => Promise<void>, errorKey: string) => {
    if (busy) return;
    setBusy(true);
    try { await operation(); }
    catch (error: unknown) { reportUiError(t(errorKey), error); }
    finally { setBusy(false); }
  };
  const handleCreate = () => run(async () => {
    const workspaceId = global ? createWorkspace : destination;
    if (!name.trim() || !workspaceId) return;
    const id = await store.createGlossary(name.trim(), undefined, undefined, undefined, workspaceId);
    if (global && workspaceFilter !== 'all' && workspaceFilter !== workspaceId) setWorkspaceFilter(workspaceId);
    setCreating(false); setName(''); store.setExpandedGlossaryId(id);
  }, 'library.dictionaryCreateError');
  const handleSave = (id: string) => run(async () => {
    await store.saveGlossaryEntries(id, scope);
    if (currentProjectId && config.assignedGlossaryId === id) await assignGlossary(id);
    toast.success(t('library.dictionarySaved'));
  }, 'library.dictionarySaveError');
  const handleDelete = async (glossary: Glossary) => {
    if (!await confirm({ title: t('library.dictionaryDeleteTitle'), message: t('library.dictionaryDeleteMessage', { name: glossary.name }), confirmLabel: t('common.delete'), danger: true })) return;
    await run(() => store.deleteGlossary(glossary.id), 'library.dictionaryDeleteError');
  };
  const handleCopy = (glossary: Glossary) => run(async () => {
    if (!destination) return;
    const id = await store.forkGlossary(glossary.id, `${glossary.name} (${t('library.copySuffix')})`, destination);
    store.setExpandedGlossaryId(id);
    toast.success(t('library.dictionaryCopied'));
  }, 'library.dictionaryForkError');
  const handleCopyExisting = async (source: Glossary, copyName: string) => {
    if (!destination) return;
    try {
      const id = await store.forkGlossary(source.id, copyName, destination);
      store.setExpandedGlossaryId(id);
      if (!global && currentProjectId) { await assignGlossaryToProject(currentProjectId, id); await assignGlossary(id); }
      toast.success(t('library.dictionaryCopied'));
    } catch (error: unknown) { reportUiError(t('library.dictionaryForkError'), error); throw error; }
  };
  const handleAssign = (id: string) => run(async () => {
    if (!currentProjectId) return;
    await assignGlossaryToProject(currentProjectId, id);
    await assignGlossary(id);
    toast.success(t('library.dictionaryAssigned'));
  }, 'library.dictionaryAssignError');
  const visible = store.glossaries.filter((glossary) => (workspaceFilter !== 'none' || !global || !glossary.workspaceId)
    && glossary.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const chooseWorkspaceReason = !destination ? ` — ${t('library.chooseWorkspace')}` : '';

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {global ? <ResourceWorkspaceFilter value={workspaceFilter} disabled={busy || store.dirtyIds.length > 0 || creating} onChange={(value) => { store.setExpandedGlossaryId(null); setWorkspaceFilter(value); }} /> : <span />}
      <div className="flex gap-1">
        <Hint label={global ? t('library.editOriginalHint') : t('library.editWorkspaceHint')} />
        <IconButton onClick={() => setImporting(true)} disabled={busy || !destination} title={`${t('library.importCsv')}${chooseWorkspaceReason}`}><Upload size={14} /></IconButton>
        <IconButton onClick={() => { setCreating(true); setName(''); setCreateWorkspace(destination ?? ''); }} disabled={busy || creating || workspaces.length === 0 && !destination} title={t('library.newDictionary')}><Plus size={14} /></IconButton>
        <IconButton onClick={() => setCopying(true)} disabled={busy || !destination} title={`${t('library.copyExistingDictionary')}${chooseWorkspaceReason}`}><Copy size={14} /></IconButton>
      </div>
    </div>
    <CatalogSearchField value={search} onChange={setSearch} label={t('library.dictionarySearch')} placeholder={t('library.dictionarySearch')} />
    {creating && <div className="flex flex-wrap items-center gap-2 border-y border-rule py-3">
      <input value={name} onChange={(event) => setName(event.target.value)} aria-label={t('library.dictionaryNamePlaceholder')} className={FIELD_INLINE_CLASSNAME} disabled={busy} />
      {global && <Select value={createWorkspace} onChange={setCreateWorkspace} disabled={busy} ariaLabel={t('library.destinationWorkspace')}
        options={[{ value: '', label: t('library.chooseWorkspace') }, ...workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))]} />}
      <IconButton onClick={() => setCreating(false)} disabled={busy} title={t('common.cancel')}><X size={14} /></IconButton>
      <IconButton onClick={() => void handleCreate()} disabled={busy || !name.trim() || !(global ? createWorkspace : destination)} title={`${t('common.save')}${!name.trim() ? ` — ${t('library.dictionaryNameRequired')}` : !(global ? createWorkspace : destination) ? ` — ${t('library.chooseWorkspace')}` : ''}`}><Save size={14} /></IconButton>
    </div>}
    {loading ? <Spinner label={t('common.loading')} /> : loadFailed ? <p role="alert">{t('library.dictionaryLoadError')}</p> : <div className="divide-y divide-rule border-y border-rule">
      {visible.length === 0 && <p className="py-8 text-center text-sm italic text-editorial-muted">{t('library.noDictionaries')}</p>}
      {visible.map((glossary) => {
        const expanded = store.expandedGlossaryId === glossary.id;
        const assigned = !!currentProjectId && config.assignedGlossaryId === glossary.id;
        const dirty = store.dirtyIds.includes(glossary.id);
        const home = workspaces.find((workspace) => workspace.id === glossary.workspaceId);
        return <article key={glossary.id} className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-expanded={expanded} aria-controls={`dictionary-entries-${glossary.id}`} disabled={busy}
              onClick={() => store.setExpandedGlossaryId(expanded ? null : glossary.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:ring-2 focus-visible:ring-editorial-accent">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              <span className="break-words font-display text-base italic text-editorial-ink">{glossary.name}</span>
            </button>
            {renaming === glossary.id && <RenameField initial={glossary.name} label={t('library.renameDictionary')} onCancel={() => setRenaming(null)}
              onSave={(value) => void run(async () => { await store.renameGlossary(glossary.id, value); setRenaming(null); }, 'library.dictionaryRenameError')} />}
            {assigned && <Hint label={t('library.assignedBadge')}><Check size={14} className="text-editorial-accent" /></Hint>}
            <div className="flex shrink-0 gap-1">
              {!global && currentProjectId && <IconButton onClick={() => void handleAssign(glossary.id)} disabled={busy || assigned} title={t('library.assignToProject')}><Check size={14} /></IconButton>}
              <IconButton onClick={() => setRenaming(glossary.id)} disabled={busy} title={t('library.renameDictionary')}><Pencil size={14} /></IconButton>
              <IconButton onClick={() => setExporting(glossary)} disabled={busy || dirty} title={`${t('library.exportGlossary')}${dirty ? ` — ${t('library.saveDictionaryFirst')}` : ''}`}><Download size={14} /></IconButton>
              <IconButton onClick={() => void handleCopy(glossary)} disabled={busy || !destination || dirty} title={`${t('library.forkDictionary')}${dirty ? ` — ${t('library.saveDictionaryFirst')}` : chooseWorkspaceReason}`}><Copy size={14} /></IconButton>
              <IconButton onClick={() => void handleDelete(glossary)} disabled={busy} title={`${t('common.delete')}: ${glossary.name}`}><Trash2 size={14} /></IconButton>
            </div>
          </div>
          {global && <div className="mt-1 text-xs text-editorial-muted">{home ? <WorkspaceIdentity workspace={home} iconSize={13} /> : t('memory.provenance.noWorkspace')}</div>}
          {expanded && <div id={`dictionary-entries-${glossary.id}`} className="mt-3 space-y-3 border-t border-rule pt-3">
            {loadingEntries ? <Spinner label={t('common.loading')} /> : entryError ? <p role="alert">{t('library.dictionaryLoadError')}</p> : <>
              <dl className="space-y-1">
                <StatRow label={t('library.editingWhat')} value={localOverride ? t('library.localCorrections') : t('library.sharedOriginal')}
                  info={localOverride ? t('library.editWorkspaceHint') : t('library.editOriginalHint')} />
                <StatRow label={t('library.appliesWhere')} value={localOverride ? activeWorkspace?.name ?? t('memory.provenance.unknownWorkspace') : t('library.linkedWorkspaces')} />
                {localOverride && <StatRow label={t('library.newEntriesWhere')} value={t('library.sharedOriginal')} info={t('library.newEntriesSharedHint')} />}
              </dl>
              <fieldset disabled={busy}>
                <DictionaryEntryEditor entries={store.entriesMap[glossary.id] ?? []} sourceReadOnly={localOverride}
                  onChange={(entries) => { store.setGlossaryEntries(glossary.id, entries); store.markDirty(glossary.id); }} />
              </fieldset>
              <div className="flex items-center justify-end gap-2">
                {dirty && <span className="text-xs text-editorial-muted">{t('library.unsavedChangesTitle')}</span>}
                <IconButton onClick={() => void handleSave(glossary.id)} disabled={busy || !dirty} title={`${t('common.save')}${!dirty ? ` — ${t('library.noChanges')}` : ''}`}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                </IconButton>
              </div>
            </>}
          </div>}
        </article>;
      })}
    </div>}
    {importing && destination && <CsvImportDialog workspaceId={destination} onClose={() => setImporting(false)} onImported={async (id, count) => {
      store.setGlossaryEntries(id, await getGlossaryEntries(id)); store.setExpandedGlossaryId(id); toast.success(t('library.csvImportSuccess', { count }));
    }} />}
    {destination && <CopyGlossaryDialog open={copying} destinationWorkspaceId={destination} onClose={() => setCopying(false)} onCopy={handleCopyExisting} />}
    <DictionaryExportDialog glossary={exporting} onClose={() => setExporting(null)} />
  </div>;
}
