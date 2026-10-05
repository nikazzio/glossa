import { reportUiError } from '../../utils/reportUiError';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookMarked, BookOpenText, Brain, Check, Download, Loader2, Pencil, RefreshCcw, Save, SlidersHorizontal, Tags, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { addPhraseMemoryEmbedding, setPhraseMemoryTags, deletePhraseMemoryEntry, exportPhraseMemoryToCsv, listPhraseMemoryEntries, updatePhraseMemoryEntry, type PhraseMemoryEntry } from '../../services/phraseMemoryService';
import { addGlossaryEntry, getGlossaryEntries } from '../../services/glossaryService';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { confirm } from '../../stores/confirmStore';
import { generateId } from '../../utils';
import { usePhraseProvenanceLookup } from '../../hooks/usePhraseProvenanceLookup';
import { useLanguageLabel } from '../../hooks/useLanguageLabel';
import { CatalogSearchField, IconButton, SectionLabel, Select, Spinner, StatBlock, FieldLabel, Tooltip } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';
import { PhraseProvenance } from './PhraseProvenance';
import { MemoryMetadataEditor } from './MemoryMetadataEditor';
import { ResourceWorkspaceFilter } from './ResourceWorkspaceFilter';

export function MemoriesTab({ onEditingChange, onBusyChange }: { onEditingChange?: (value: boolean) => void; onBusyChange?: (value: boolean) => void } = {}) {
  const { t } = useTranslation();
  const languageLabel = useLanguageLabel();
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace);
  const { glossaries, libraryScope, dirtyIds } = useLibraryStore();
  const [workspaceFilter, setWorkspaceFilter] = useState(() => libraryScope === 'global' ? 'all' : activeWorkspace?.id ?? 'all');
  const [entries, setEntries] = useState<PhraseMemoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState('');
  const [metadataEditingId, setMetadataEditingId] = useState<string | null>(null);
  const metadataEditing = metadataEditingId !== null;
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const request = useRef(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [measuringId, setMeasuringId] = useState<string | null>(null);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [glossaryId, setGlossaryId] = useState('');
  useEffect(() => { onEditingChange?.(editingId !== null || metadataEditing); return () => onEditingChange?.(false); }, [editingId, metadataEditing, onEditingChange]);
  useEffect(() => { onBusyChange?.(busyId !== null); return () => onBusyChange?.(false); }, [busyId, onBusyChange]);
  const lookup = usePhraseProvenanceLookup(entries);
  const allTags = [...new Set(entries.flatMap((entry) => entry.tags))].sort();
  const visible = entries.filter((entry) => (!tagFilter || entry.tags.includes(tagFilter)) && `${entry.sourcePhrase} ${entry.targetPhrase} ${entry.tags.join(' ')}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  const loadEntries = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setLoadError(false);
    try {
      const loaded = await listPhraseMemoryEntries(workspaceFilter === 'all' || workspaceFilter === 'none' ? null : workspaceFilter);
      if (current !== request.current) return;
      setEntries(workspaceFilter === 'none' ? loaded.filter((entry) => entry.workspaceId === null) : loaded);
    } catch (error: unknown) {
      if (current !== request.current) return;
      setEntries([]);
      setLoadError(true);
      reportUiError(t('library.memoryLoadError'), error);
    } finally { if (current === request.current) setLoading(false); }
  }, [t, workspaceFilter]);
  useEffect(() => { void loadEntries(); return () => { request.current += 1; }; }, [loadEntries]);

  const handleSave = async (entry: PhraseMemoryEntry) => {
    if (busyId || !source.trim() || !target.trim()) return;
    setBusyId(entry.id);
    if (source.trim() !== entry.sourcePhrase && entry.embeddings.length > 0 && !await confirm({
      title: t('library.measureTitle'), message: t('library.sourceRecalculateMessage', { count: entry.embeddings.length }),
      confirmLabel: t('common.save'), cancelLabel: t('common.cancel'),
    })) { setBusyId(null); return; }
    try {
      await updatePhraseMemoryEntry({ entry, sourcePhrase: source, targetPhrase: target });
      setEditingId(null);
      await loadEntries();
      toast.success(t('library.memoryUpdated'));
    } catch (error: unknown) { reportUiError(t('library.memoryUpdateError'), error); }
    finally { setBusyId(null); }
  };
  const handleDelete = async (entry: PhraseMemoryEntry) => {
    const ok = await confirm({ title: t('library.memoryDeleteTitle'), message: t('library.memoryDeleteMessage'), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    setBusyId(entry.id);
    try {
      await deletePhraseMemoryEntry(entry.workspaceId, entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      toast.success(t('library.memoryDeleted'));
    } catch (error: unknown) { reportUiError(t('library.memoryDeleteError'), error); }
    finally { setBusyId(null); }
  };
  const handleExport = async () => {
    try {
      const path = await save({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: 'phrase-memory.csv' });
      if (path) await writeTextFile(path, exportPhraseMemoryToCsv(visible));
    } catch (error: unknown) { reportUiError(t('library.exportCsvError'), error); }
  };
  const handleAdd = async (entry: PhraseMemoryEntry) => {
    if (!glossaryId || busyId) return;
    setBusyId(entry.id);
    try {
      await addGlossaryEntry(glossaryId, { id: generateId('gle'), term: entry.sourcePhrase, translation: entry.targetPhrase });
      const library = useLibraryStore.getState();
      library.setGlossaryEntries(glossaryId, await getGlossaryEntries(glossaryId, library.entriesWorkspaceMap[glossaryId] ?? null));
      setPickerId(null);
      toast.success(t('library.addedToGlossary'));
    } catch (error: unknown) { reportUiError(t('library.addToGlossaryError'), error); }
    finally { setBusyId(null); }
  };

  const handleMeasure = async (entry: PhraseMemoryEntry, model: import('../../types').EmbeddingModel) => {
    if (busyId) return;
    setBusyId(entry.id);
    if (!await confirm({ title: t('library.measureTitle'), message: t('library.measureMessage', { model }),
      confirmLabel: t('common.confirm'), cancelLabel: t('common.cancel') })) { setBusyId(null); return; }
    setMeasuringId(entry.id);
    try { await addPhraseMemoryEmbedding(entry, model); await loadEntries(); toast.success(t('library.measureSaved')); }
    catch (error: unknown) { reportUiError(t('library.memoryUpdateError'), error); }
    finally { setMeasuringId(null); setBusyId(null); }
  };
  const handleTags = async (entry: PhraseMemoryEntry, tags: string[]) => {
    setBusyId(entry.id);
    try { await setPhraseMemoryTags(entry, tags); await loadEntries(); }
    catch (error: unknown) { reportUiError(t('library.memoryUpdateError'), error); throw error; }
    finally { setBusyId(null); }
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SectionLabel icon={Brain} label={t('library.memoriesCount', { count: visible.length })} />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={tagFilter} onChange={setTagFilter} disabled={metadataEditing || editingId !== null || busyId !== null}
      ariaLabel={t('library.filterByTag')} options={[{ value: '', label: t('library.allTags') }, ...allTags.map((tag) => ({ value: tag, label: tag }))]} />
        <ResourceWorkspaceFilter value={workspaceFilter} disabled={busyId !== null || editingId !== null || metadataEditing} onChange={(value) => { setWorkspaceFilter(value); setPickerId(null); setDetailsId(null); }} />
        <IconButton onClick={() => void handleExport()} disabled={loading || visible.length === 0} title={`${t('library.exportCsv')}${visible.length === 0 ? ` — ${t('library.noMemories')}` : ''}`}><Download size={14} /></IconButton>
        <IconButton onClick={() => void loadEntries()} disabled={loading || busyId !== null || editingId !== null || metadataEditing} title={t('common.refresh')}><RefreshCcw size={14} /></IconButton>
      </div>
    </div>
    <CatalogSearchField value={search} onChange={setSearch} disabled={metadataEditing || editingId !== null || busyId !== null} disabledReason={t('library.searchEditingHint')} label={t('library.memorySearch')} placeholder={t('library.memorySearch')} />
    {loading ? <Spinner label={t('common.loading')} /> : loadError ? <p role="alert" className="text-sm text-editorial-warning">{t('library.memoryLoadError')}</p>
      : <div className="space-y-3">
        {visible.length === 0 && <p className="py-8 text-center text-sm italic text-editorial-muted">{t('library.noMemories')}</p>}
        {visible.map((entry) => {
          const detailsOpen = detailsId === entry.id;
          const origin = entry.provenance.sourceTitle || entry.provenance.projectName
            || lookup.projectNames[entry.projectId ?? '']
            || t(entry.workspaceId ? 'memory.provenance.unknownTranslation' : 'memory.provenance.noWorkspace');
          return <article key={entry.id} className="space-y-3 linguistic-resource rounded-md bg-surface-resource p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-editorial-muted">
              <BookOpenText size={13} className="shrink-0" aria-hidden="true" />
              <Tooltip label={origin} className="min-w-0 flex-1"><span className="truncate">{origin}</span></Tooltip>
            </div>
            <span className="text-xs text-editorial-muted">{languageLabel(entry.sourceLanguage)} → {languageLabel(entry.targetLanguage)}</span>
            <div className="flex shrink-0 gap-1">
              <IconButton size="sm" onClick={() => setDetailsId(detailsOpen ? null : entry.id)}
                disabled={busyId !== null || editingId !== null || metadataEditing}
                aria-expanded={detailsOpen} aria-controls={`memory-details-${entry.id}`}
                title={t('library.memoryDetails')}><SlidersHorizontal size={14} /></IconButton>
              <IconButton size="sm" onClick={() => { setPickerId(pickerId === entry.id ? null : entry.id); setGlossaryId(glossaries[0]?.id ?? ''); }}
                disabled={busyId !== null || editingId !== null || metadataEditing || glossaries.length === 0} ariaPressed={pickerId === entry.id}
                title={`${t('library.addToGlossary')}${glossaries.length === 0 ? ` — ${t('library.noDictionaryAssigned')}` : ''}`}><BookMarked size={14} /></IconButton>
              <IconButton size="sm" onClick={() => { setEditingId(entry.id); setSource(entry.sourcePhrase); setTarget(entry.targetPhrase); setPickerId(null); }}
                disabled={busyId !== null || editingId !== null || metadataEditing} title={t('common.edit')}><Pencil size={14} /></IconButton>
              <IconButton size="sm" onClick={() => void handleDelete(entry)} disabled={busyId !== null || editingId !== null || metadataEditing} title={t('common.delete')}><Trash2 size={14} /></IconButton>
            </div>
          </div>
          {editingId === entry.id ? <fieldset disabled={busyId !== null} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
            <FieldLabel block htmlFor={`memory-source-${entry.id}`}>{t('memory.sourcePhraseLabel')}</FieldLabel>
            <textarea id={`memory-source-${entry.id}`} value={source} onChange={(event) => setSource(event.target.value)} rows={3} className={FIELD_CLASSNAME} />
            </div><div className="min-w-0 space-y-2">
            <FieldLabel block htmlFor={`memory-target-${entry.id}`}>{t('glossary.translation')}</FieldLabel>
            <textarea id={`memory-target-${entry.id}`} value={target} onChange={(event) => setTarget(event.target.value)} rows={3} className={FIELD_CLASSNAME} />
            </div><div className="flex justify-end gap-1 sm:col-span-2">
              <IconButton onClick={() => setEditingId(null)} disabled={busyId !== null} title={t('common.cancel')}><X size={14} /></IconButton>
              <IconButton onClick={() => void handleSave(entry)} disabled={busyId !== null || !source.trim() || !target.trim()} title={`${t('common.save')}${!source.trim() || !target.trim() ? ` — ${t('library.phrasesRequired')}` : ''}`}>
                {busyId ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              </IconButton>
            </div>
          </fieldset> : <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <StatBlock label={t('memory.sourcePhraseLabel')} value={entry.sourcePhrase} />
            <StatBlock label={t('glossary.translation')} value={entry.targetPhrase} />
          </div>}
          {entry.tags.length > 0 && <Tooltip label={entry.tags.join('; ')} className="max-w-full text-xs text-editorial-muted">
            <Tags size={13} className="mr-1.5 shrink-0" aria-hidden="true" /><span className="truncate">{entry.tags.join('; ')}</span>
          </Tooltip>}
          {detailsOpen && <div id={`memory-details-${entry.id}`} className="min-w-0 space-y-4">
            <PhraseProvenance compact createdAt={entry.createdAt} workspaceId={entry.workspaceId} projectId={entry.projectId} chunkId={entry.chunkId} lookup={lookup}
              currentWorkspaceId={libraryScope === 'workspace' ? activeWorkspace?.id : null} provenance={entry.provenance} sourcePhrase={entry.sourcePhrase} />
            <MemoryMetadataEditor entry={entry} measuring={measuringId === entry.id} disabled={busyId !== null || editingId !== null || (metadataEditing && metadataEditingId !== entry.id)}
              onMeasure={(model) => void handleMeasure(entry, model)} onTags={(tags) => handleTags(entry, tags)}
              onEditing={(value) => setMetadataEditingId(value ? entry.id : null)} />
          </div>}
          {pickerId === entry.id && <div className="flex items-center gap-2 border-t border-rule pt-3">
            <Select value={glossaryId} onChange={setGlossaryId} disabled={busyId !== null} ariaLabel={t('glossary.selectGlossary')} options={glossaries.map((glossary) => ({ value: glossary.id, label: glossary.name }))} />
            <IconButton onClick={() => void handleAdd(entry)} disabled={busyId !== null || !glossaryId || dirtyIds.includes(glossaryId)} title={`${t('common.confirm')}${dirtyIds.includes(glossaryId) ? ` — ${t('library.saveDictionaryFirst')}` : ''}`}><Check size={14} /></IconButton>
            <IconButton onClick={() => setPickerId(null)} disabled={busyId !== null} title={t('common.cancel')}><X size={14} /></IconButton>
          </div>}
        </article>; })}
      </div>}
  </div>;
}
