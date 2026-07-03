import { useState } from 'react';
import { Plus, Trash2, Copy, Upload, Download, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { useLibraryStore } from '../../stores/libraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { useProjectStore } from '../../stores/projectStore';
import {
  getGlossaryEntries,
  assignGlossaryToProject,
  exportGlossaryToCsv,
  exportGlossaryToXlsx,
} from '../../services/glossaryService';
import { confirm } from '../../stores/confirmStore';
import type { GlossaryEntry } from '../../types';
import { DictionaryEntryEditor } from './DictionaryEntryEditor';
import { CsvImportDialog } from './CsvImportDialog';
import { Dialog, DialogCancelButton, IconButton } from '../ui';

export function DictionariesTab() {
  const { t } = useTranslation();
  const {
    glossaries,
    createGlossary,
    renameGlossary,
    deleteGlossary,
    forkGlossary,
    entriesMap,
    dirtyIds,
    expandedGlossaryId,
    setGlossaryEntries,
    loadGlossaryEntries,
    markDirty,
    setExpandedGlossaryId,
    saveGlossaryEntries,
  } = useLibraryStore();
  const { config, assignGlossary } = usePipelineStore();
  const { currentProjectId } = useProjectStore();
  const { activeWorkspace } = useWorkspaceStore();

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [exportTarget, setExportTarget] = useState<{ id: string; name: string } | null>(null);

  const handleToggle = async (id: string) => {
    if (expandedGlossaryId === id) {
      setExpandedGlossaryId(null);
      return;
    }
    setExpandedGlossaryId(id);
    await loadGlossaryEntries(id);
  };

  const handleEntriesChange = (id: string, entries: GlossaryEntry[]) => {
    setGlossaryEntries(id, entries);
    markDirty(id);
  };

  const handleSaveEntries = async (id: string) => {
    try {
      await saveGlossaryEntries(id);
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
      await createGlossary(newName.trim(), undefined, undefined, undefined, activeWorkspace?.id ?? null);
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
    } catch (err: any) {
      toast.error(t('library.dictionaryDeleteError'), { description: err?.message });
    }
  };

  const handleFork = async (id: string, name: string) => {
    try {
      const newId = await forkGlossary(id, `${name} (copia)`);
      const forkedEntries = await getGlossaryEntries(newId);
      setGlossaryEntries(newId, forkedEntries);
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
    try {
      if (currentProjectId) {
        await assignGlossaryToProject(currentProjectId, glossaryId);
      }
      await assignGlossary(glossaryId);
      toast.success(t('library.dictionaryAssigned'));
    } catch (err: any) {
      toast.error(t('library.dictionaryAssignError'), { description: err?.message });
    }
  };

  const handleImported = async (glossaryId: string, count: number) => {
    const entries = await getGlossaryEntries(glossaryId);
    setGlossaryEntries(glossaryId, entries);
    setExpandedGlossaryId(glossaryId);
    toast.success(t('library.csvImportSuccess', { count }));
  };

  const handleExport = async (glossaryId: string, glossaryName: string, format: 'csv' | 'xlsx') => {
    setExportTarget(null);
    try {
      const entries = entriesMap[glossaryId] ?? await getGlossaryEntries(glossaryId);
      const safeName = glossaryName.replace(/[/\\:*?"<>|]/g, '_') || 'glossary';
      if (format === 'csv') {
        const csvText = exportGlossaryToCsv(entries);
        const path = await save({
          title: t('library.exportSaveTitle'),
          defaultPath: `${safeName}.csv`,
          filters: [{ name: 'CSV', extensions: ['csv'] }],
        });
        if (!path) return;
        await writeTextFile(path, csvText);
      } else {
        const data = await exportGlossaryToXlsx(glossaryName, entries);
        const path = await save({
          title: t('library.exportSaveTitle'),
          defaultPath: `${safeName}.xlsx`,
          filters: [{ name: 'Excel', extensions: ['xlsx'] }],
        });
        if (!path) return;
        await writeFile(path, data);
      }
      toast.success(t('library.exportSuccess'));
    } catch (err: unknown) {
      toast.error(t('library.exportError'), { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-editorial-muted">{t('library.dictionariesDesc')}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton onClick={() => setShowImport(true)} title={t('library.importCsv')}>
            <Upload size={13} />
          </IconButton>
          <IconButton onClick={() => setCreating(true)} title={t('library.newDictionary')}>
            <Plus size={13} />
          </IconButton>
        </div>
      </div>

      {creating && (
        <div className="flex flex-col gap-3 border-y border-editorial-border/70 py-4 sm:flex-row sm:items-center">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder={t('library.dictionaryNamePlaceholder')}
            className="flex-1 rounded-md border border-editorial-border bg-editorial-bg/80 px-4 py-2.5 text-sm font-display italic text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setCreating(false)}
              data-tooltip={t('common.cancel')}
              aria-label={t('common.cancel')}
              className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <X size={14} />
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              data-tooltip={t('common.save')}
              aria-label={t('common.save')}
              className="rounded-full bg-editorial-accent p-2 text-white transition-colors hover:bg-editorial-accent/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      )}

      {glossaries.length === 0 && !creating ? (
        <p className="border-y border-dashed border-editorial-border/70 py-8 text-center text-sm italic text-editorial-muted/70">
          {t('library.noDictionaries')}
        </p>
      ) : null}

      <div className="space-y-3">
        {glossaries.map((g) => {
          const isExpanded = expandedGlossaryId === g.id;
          const isAssigned = config.assignedGlossaryId === g.id;
          const isDirty = dirtyIds.includes(g.id);

          return (
            <div
              key={g.id}
              className={`border-b border-editorial-border/70 transition-colors ${
                isAssigned
                  ? 'bg-editorial-accent/5'
                  : 'hover:bg-editorial-textbox/15'
              }`}
            >
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  onClick={() => handleToggle(g.id)}
                  className="flex flex-1 items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                >
                  {isExpanded
                    ? <ChevronUp size={14} className="shrink-0 text-editorial-muted" />
                    : <ChevronDown size={14} className="shrink-0 text-editorial-muted" />}
                  {renamingId === g.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(g.id); if (e.key === 'Escape') setRenamingId(null); }}
                      onBlur={() => handleRenameSubmit(g.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 border-b border-editorial-accent/60 bg-transparent text-sm font-display italic outline-none"
                    />
                  ) : (
                    <span
                      className="truncate font-display text-base italic text-editorial-ink"
                      onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(g.id); setRenameValue(g.name); }}
                      data-tooltip={t('library.doubleClickRename')}
                    >
                      {g.name}
                    </span>
                  )}
                  {isAssigned && (
                    <span className="shrink-0 rounded-full bg-editorial-accent/20 px-3 py-0.5 text-[9px] font-bold uppercase tracking-[0.25em] text-editorial-accent">
                      {t('library.assignedBadge')}
                    </span>
                  )}
                </button>

                <div className="flex shrink-0 items-center gap-1.5">
                  {!isAssigned && (
                    <IconButton
                      onClick={() => handleAssign(g.id)}
                      title={t('library.assignToProject')}
                    >
                      <Check size={13} />
                    </IconButton>
                  )}
                  <button
                    onClick={() => setExportTarget({ id: g.id, name: g.name })}
                    data-tooltip={t('library.exportGlossary')}
                    aria-label={t('library.exportGlossary')}
                    className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:bg-editorial-textbox/30 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    <Download size={13} />
                  </button>
                  <button
                    onClick={() => handleFork(g.id, g.name)}
                    data-tooltip={t('library.forkDictionary')}
                    aria-label={t('library.forkDictionary')}
                    className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:bg-editorial-textbox/30 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(g.id, g.name)}
                    data-tooltip={t('common.delete')}
                    aria-label={`${t('common.delete')}: ${g.name}`}
                    className="rounded-full border border-editorial-border p-2 text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:bg-editorial-textbox/30 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-editorial-border/40 px-4 pb-4 pt-4">
                  <DictionaryEntryEditor
                    entries={entriesMap[g.id] ?? []}
                    onChange={(entries) => handleEntriesChange(g.id, entries)}
                  />
                  {isDirty && (
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => handleSaveEntries(g.id)}
                        className="flex items-center gap-2 rounded-full bg-editorial-accent px-5 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-editorial-accent/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
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

      {showImport && (
        <CsvImportDialog
          workspaceId={activeWorkspace?.id ?? null}
          onImported={handleImported}
          onClose={() => setShowImport(false)}
        />
      )}

      <Dialog
        open={exportTarget !== null}
        onOpenChange={(open) => {
          if (!open) setExportTarget(null);
        }}
        title={t('library.exportGlossary')}
        closeLabel={t('common.close')}
        widthClassName="max-w-sm"
        bodyClassName="px-5 py-4"
        footer={
          <div className="flex justify-end">
            <DialogCancelButton onClick={() => setExportTarget(null)}>
              {t('common.cancel')}
            </DialogCancelButton>
          </div>
        }
      >
        <div className="divide-y divide-editorial-border/70 border-y border-editorial-border/70">
          <button
            type="button"
            onClick={() => exportTarget && handleExport(exportTarget.id, exportTarget.name, 'csv')}
            className="flex w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <span className="font-display text-lg italic text-editorial-ink">CSV</span>
            <span className="text-xs text-editorial-muted">.csv</span>
          </button>
          <button
            type="button"
            onClick={() => exportTarget && handleExport(exportTarget.id, exportTarget.name, 'xlsx')}
            className="flex w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
          >
            <span className="font-display text-lg italic text-editorial-ink">Excel</span>
            <span className="text-xs text-editorial-muted">.xlsx</span>
          </button>
        </div>
      </Dialog>
    </div>
  );
}
