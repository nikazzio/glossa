import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Copy, Upload, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLibraryStore } from '../../stores/libraryStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import { getGlossaryEntries, upsertGlossaryEntries, assignGlossaryToProject } from '../../services/glossaryService';
import { confirm } from '../../stores/confirmStore';
import type { GlossaryEntry } from '../../types';
import { DictionaryEntryEditor } from './DictionaryEntryEditor';
import { CsvImportDialog } from './CsvImportDialog';

export function DictionariesTab() {
  const { t } = useTranslation();
  const {
    glossaries,
    createGlossary,
    renameGlossary,
    deleteGlossary,
    forkGlossary,
    importCsv,
    reloadGlossaries,
  } = useLibraryStore();
  const { config, assignGlossary } = usePipelineStore();
  const { currentProjectId } = useProjectStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [entriesMap, setEntriesMap] = useState<Record<string, GlossaryEntry[]>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [csvTargetId, setCsvTargetId] = useState<string | null>(null);

  const loadEntries = useCallback(async (id: string) => {
    if (entriesMap[id]) return;
    const entries = await getGlossaryEntries(id);
    setEntriesMap((prev) => ({ ...prev, [id]: entries }));
  }, [entriesMap]);

  const handleToggle = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    await loadEntries(id);
  };

  const handleEntriesChange = (id: string, entries: GlossaryEntry[]) => {
    setEntriesMap((prev) => ({ ...prev, [id]: entries }));
    setDirtyIds((prev) => new Set(prev).add(id));
  };

  const handleSaveEntries = async (id: string) => {
    try {
      await upsertGlossaryEntries(id, entriesMap[id] ?? []);
      setDirtyIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      // Ricarica nel pipelineStore se è il dizionario assegnato al progetto corrente
      if (config.assignedGlossaryId === id) {
        await assignGlossary(id);
      }
      toast.success(t('library.dictionarySaved'));
    } catch (err: any) {
      toast.error(t('library.dictionarySaveError'), { description: err?.message });
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createGlossary(newName.trim());
      setNewName('');
      setCreating(false);
    } catch (err: any) {
      toast.error(t('library.dictionaryCreateError'), { description: err?.message });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('library.dictionaryDeleteTitle'),
      message: t('library.dictionaryDeleteMessage', { name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteGlossary(id);
      if (expandedId === id) setExpandedId(null);
      setEntriesMap((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } catch (err: any) {
      toast.error(t('library.dictionaryDeleteError'), { description: err?.message });
    }
  };

  const handleFork = async (id: string, name: string) => {
    try {
      const newId = await forkGlossary(id, `${name} (copia)`);
      const forkedEntries = await getGlossaryEntries(newId);
      setEntriesMap((prev) => ({ ...prev, [newId]: forkedEntries }));
    } catch (err: any) {
      toast.error(t('library.dictionaryForkError'), { description: err?.message });
    }
  };

  const handleRenameSubmit = async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    try {
      await renameGlossary(id, renameValue.trim());
    } catch (err: any) {
      toast.error(t('library.dictionaryRenameError'), { description: err?.message });
    }
    setRenamingId(null);
  };

  const handleAssign = async (glossaryId: string) => {
    if (!currentProjectId) return;
    try {
      await assignGlossaryToProject(currentProjectId, glossaryId);
      await assignGlossary(glossaryId);
      toast.success(t('library.dictionaryAssigned'));
    } catch (err: any) {
      toast.error(t('library.dictionaryAssignError'), { description: err?.message });
    }
  };

  const handleCsvImport = async (glossaryId: string, csvText: string, strategy: 'replace' | 'merge') => {
    const count = await importCsv(glossaryId, csvText, strategy);
    const entries = await getGlossaryEntries(glossaryId);
    setEntriesMap((prev) => ({ ...prev, [glossaryId]: entries }));
    if (config.assignedGlossaryId === glossaryId) {
      await assignGlossary(glossaryId);
    }
    toast.success(t('library.csvImportSuccess', { count }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-editorial-muted">{t('library.dictionariesDesc')}</p>
        <button
          onClick={() => setCreating(true)}
          title={t('library.newDictionary')}
          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-editorial-accent hover:text-editorial-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
        >
          <Plus size={13} /> {t('library.newDictionary')}
        </button>
      </div>

      {creating && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder={t('library.dictionaryNamePlaceholder')}
            className="flex-1 bg-transparent rounded py-2 px-3 text-[11px] font-mono outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent border border-editorial-border/60 focus:border-editorial-accent/60"
          />
          <button onClick={handleCreate} className="text-editorial-accent hover:text-editorial-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent p-1">
            <Check size={14} />
          </button>
          <button onClick={() => setCreating(false)} className="text-editorial-muted hover:text-editorial-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent p-1">
            <X size={14} />
          </button>
        </div>
      )}

      {glossaries.length === 0 && !creating && (
        <p className="text-[11px] text-editorial-muted/60 text-center py-6 border border-dashed border-editorial-border/60 rounded-lg">
          {t('library.noDictionaries')}
        </p>
      )}

      <div className="space-y-2">
        {glossaries.map((g) => {
          const isExpanded = expandedId === g.id;
          const isAssigned = config.assignedGlossaryId === g.id;
          const isDirty = dirtyIds.has(g.id);

          return (
            <div
              key={g.id}
              className={`rounded-lg border ${isAssigned ? 'border-editorial-accent/40 bg-editorial-accent/5' : 'border-editorial-border/40 bg-editorial-textbox/10'}`}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => handleToggle(g.id)}
                  className="flex-1 flex items-center gap-2 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  {isExpanded ? <ChevronUp size={13} className="text-editorial-muted shrink-0" /> : <ChevronDown size={13} className="text-editorial-muted shrink-0" />}
                  {renamingId === g.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(g.id); if (e.key === 'Escape') setRenamingId(null); }}
                      onBlur={() => handleRenameSubmit(g.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-transparent text-[12px] font-mono outline-none border-b border-editorial-accent/60"
                    />
                  ) : (
                    <span
                      className="text-[12px] font-mono text-editorial-ink truncate"
                      onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(g.id); setRenameValue(g.name); }}
                      title={t('library.doubleClickRename')}
                    >
                      {g.name}
                    </span>
                  )}
                  {isAssigned && (
                    <span className="ml-1 shrink-0 rounded-full bg-editorial-accent/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-editorial-accent">
                      {t('library.assignedBadge')}
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  {currentProjectId && !isAssigned && (
                    <button
                      onClick={() => handleAssign(g.id)}
                      title={t('library.assignToProject')}
                      className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent px-2 py-1 border border-editorial-border/40 rounded"
                    >
                      {t('library.assign')}
                    </button>
                  )}
                  <button
                    onClick={() => { setCsvTargetId(g.id); }}
                    title={t('library.importCsv')}
                    className="p-1 text-editorial-muted/60 hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                    aria-label={t('library.importCsv')}
                  >
                    <Upload size={12} />
                  </button>
                  <button
                    onClick={() => handleFork(g.id, g.name)}
                    title={t('library.forkDictionary')}
                    className="p-1 text-editorial-muted/60 hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                    aria-label={t('library.forkDictionary')}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(g.id, g.name)}
                    title={t('common.delete')}
                    className="p-1 text-editorial-muted/60 hover:text-editorial-accent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-3 pb-3 border-t border-editorial-border/30 pt-3">
                  <DictionaryEntryEditor
                    entries={entriesMap[g.id] ?? []}
                    onChange={(entries) => handleEntriesChange(g.id, entries)}
                  />
                  {isDirty && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => handleSaveEntries(g.id)}
                        className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold uppercase tracking-widest bg-editorial-ink text-white hover:bg-editorial-ink/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                      >
                        <Check size={13} />
                        {t('common.save')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {csvTargetId && (
        <CsvImportDialog
          onImport={(csvText, strategy) => handleCsvImport(csvTargetId, csvText, strategy)}
          onClose={() => setCsvTargetId(null)}
        />
      )}
    </div>
  );
}
