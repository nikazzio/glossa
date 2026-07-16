import { useCallback, useEffect, useState } from 'react';
import { BookMarked, Brain, Check, Download, Loader2, Pencil, RefreshCcw, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import {
  deletePhraseMemoryEntry,
  exportPhraseMemoryToCsv,
  getChunkPositions,
  listPhraseMemoryEntries,
  updatePhraseMemoryEntry,
  type PhraseMemoryEntry,
} from '../../services/phraseMemoryService';
import { addGlossaryEntry, getGlossaryEntries } from '../../services/glossaryService';
import { listProjects } from '../../services/projectService';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { confirm } from '../../stores/confirmStore';
import { generateId } from '../../utils';
import { IconButton, SectionLabel } from '../ui';
import type { Workspace } from '../../types';

export function MemoriesTab() {
  const { t } = useTranslation();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const glossaries = useLibraryStore((s) => s.glossaries);
  const [entries, setEntries] = useState<PhraseMemoryEntry[]>([]);
  const [projectNameMap, setProjectNameMap] = useState<Record<string, string>>({});
  const [chunkPositionMap, setChunkPositionMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [workspaceFilter, setWorkspaceFilter] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftSource, setDraftSource] = useState('');
  const [draftTarget, setDraftTarget] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null);
  const [pickerGlossaryId, setPickerGlossaryId] = useState<string>('');
  const [addingId, setAddingId] = useState<string | null>(null);

  const handleExportCsv = async () => {
    try {
      const csvContent = exportPhraseMemoryToCsv(entries);
      const path = await save({
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        defaultPath: 'phrase-memory.csv',
      });
      if (path) {
        await writeTextFile(path, csvContent);
      }
    } catch (err: unknown) {
      toast.error(t('library.exportCsvError'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const loadEntries = useCallback(async () => {
    if (workspaces.length === 0) {
      setEntries([]);
      setProjectNameMap({});
      setChunkPositionMap({});
      return;
    }
    setIsLoading(true);
    setEditingId(null);
    try {
      const targetWorkspaces =
        workspaceFilter === 'all'
          ? workspaces
          : workspaces.filter((workspace) => workspace.id === workspaceFilter);
      const results = await Promise.all(
        targetWorkspaces.map((workspace) => listPhraseMemoryEntries(workspace.id)),
      );
      const loaded = results
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setEntries(loaded);

      const uniqueWsIds = [...new Set(loaded.map((e) => e.workspaceId))];
      const projectLists = await Promise.all(uniqueWsIds.map((id) => listProjects(id).catch(() => [])));
      const projectMap: Record<string, string> = {};
      projectLists.flat().forEach((p) => { projectMap[p.id] = p.name; });
      setProjectNameMap(projectMap);

      const chunkIds = loaded.map((e) => e.chunkId).filter((id): id is string => id !== null);
      const posMap = await getChunkPositions(chunkIds).catch(() => ({}));
      setChunkPositionMap(posMap);
    } catch (err: unknown) {
      toast.error(t('library.memoryLoadError'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, [t, workspaceFilter, workspaces]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const startEdit = (entry: PhraseMemoryEntry) => {
    setPickerOpenId(null);
    setEditingId(entry.id);
    setDraftSource(entry.sourcePhrase);
    setDraftTarget(entry.targetPhrase);
  };

  const closeEdit = () => {
    setEditingId(null);
    setDraftSource('');
    setDraftTarget('');
  };

  const handleSave = async (entry: PhraseMemoryEntry) => {
    const workspace = workspaces.find((item) => item.id === entry.workspaceId) ?? activeWorkspace;
    if (!workspace || !draftSource.trim() || !draftTarget.trim()) return;
    setBusyId(entry.id);
    try {
      await updatePhraseMemoryEntry({
        workspaceId: entry.workspaceId,
        phraseMemoryId: entry.id,
        embeddingModel: workspace.embeddingModel,
        sourcePhrase: draftSource,
        targetPhrase: draftTarget,
      });
      closeEdit();
      await loadEntries();
      toast.success(t('library.memoryUpdated'));
    } catch (err: unknown) {
      toast.error(t('library.memoryUpdateError'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (entry: PhraseMemoryEntry) => {
    const ok = await confirm({
      title: t('library.memoryDeleteTitle'),
      message: t('library.memoryDeleteMessage'),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;

    setBusyId(entry.id);
    try {
      await deletePhraseMemoryEntry(entry.workspaceId, entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      toast.success(t('library.memoryDeleted'));
    } catch (err: unknown) {
      toast.error(t('library.memoryDeleteError'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleAddToGlossary = async (entry: PhraseMemoryEntry, glossaryId: string) => {
    if (!glossaryId) return;
    setAddingId(entry.id);
    try {
      await addGlossaryEntry(glossaryId, {
        id: generateId('gle'),
        term: entry.sourcePhrase,
        translation: entry.targetPhrase,
      });
      const freshEntries = await getGlossaryEntries(glossaryId);
      const store = useLibraryStore.getState();
      store.setGlossaryEntries(glossaryId, freshEntries);
      setPickerOpenId(null);
      setPickerGlossaryId('');
      toast.success(t('library.addedToGlossary'));
      store.setShowLibraryPanel(true, 'dictionaries');
      store.setExpandedGlossaryId(glossaryId);
    } catch (err: unknown) {
      toast.error(t('library.addToGlossaryError'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div
      id="library-panel-memories"
      role="tabpanel"
      aria-labelledby="library-tab-memories"
      className="space-y-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SectionLabel icon={Brain} label={t('library.tabMemories')} />
          <span className="font-display text-sm italic text-editorial-muted">
            {t('library.memoriesCount', { count: entries.length })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-muted">
              {t('library.workspaceFilter')}
            </span>
            <select
              value={workspaceFilter}
              onChange={(event) => setWorkspaceFilter(event.target.value)}
              className="max-w-[220px] rounded-md border border-editorial-border bg-editorial-bg px-3 py-2 text-xs text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <option value="all">{t('library.allWorkspaces')}</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <IconButton
            size="md"
            onClick={() => { void handleExportCsv(); }}
            title={t('library.exportCsv')}
            disabled={isLoading}
          >
            <Download size={14} />
          </IconButton>
          <IconButton
            size="md"
            onClick={() => void loadEntries()}
            title={t('common.refresh')}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
          </IconButton>
        </div>
      </div>

      {(() => {
        const filteredWs = workspaceFilter !== 'all'
          ? workspaces.find((w) => w.id === workspaceFilter)
          : null;
        if (!filteredWs) return null;
        return (
          <div className="flex items-center gap-2 border-y border-editorial-border/70 py-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-muted">
              {t('library.embeddingModel')}
            </span>
            <span className="font-mono text-xs text-editorial-accent">{filteredWs.embeddingModel}</span>
          </div>
        );
      })()}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 border-y border-editorial-border/70 py-8 text-xs text-editorial-muted">
          <Loader2 size={14} className="animate-spin" />
          {t('common.loading')}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 border-y border-dashed border-editorial-border/70 py-12 text-center">
          <Brain size={28} className="text-editorial-border" />
          <p className="font-display text-lg italic text-editorial-muted">
            {t('library.noMemories')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const isEditing = editingId === entry.id;
            const isBusy = busyId === entry.id;
            const isAdding = addingId === entry.id;
            const isPickerOpen = pickerOpenId === entry.id;
            return (
              <article
                key={entry.id}
                className="border-l-4 border-l-editorial-success/35 border-y border-editorial-border/70 bg-editorial-bg/55 px-4 py-4 transition-colors hover:border-l-editorial-success"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs uppercase tracking-[0.16em] text-editorial-muted">
                      {entry.sourceLanguage} → {entry.targetLanguage}
                    </p>
                    <p className="mt-1 truncate text-xs text-editorial-muted/80">
                      {workspaceName(entry.workspaceId, workspaces)} · {formatDate(entry.createdAt)}
                    </p>
                    <OriginLine
                      entry={entry}
                      projectNameMap={projectNameMap}
                      chunkPositionMap={chunkPositionMap}
                      workspaceEmbeddingModel={workspaces.find((w) => w.id === entry.workspaceId)?.embeddingModel ?? null}
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isEditing ? (
                      <>
                        <IconButton
                          size="sm"
                          tone="accent"
                          onClick={() => void handleSave(entry)}
                          title={t('common.save')}
                          disabled={isBusy || !draftSource.trim() || !draftTarget.trim()}
                        >
                          {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        </IconButton>
                        <IconButton
                          size="sm"
                          onClick={closeEdit}
                          title={t('common.cancel')}
                          disabled={isBusy}
                        >
                          <X size={13} />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <IconButton
                          size="sm"
                          tone={isPickerOpen ? 'accent' : 'default'}
                          onClick={() => {
                            if (isPickerOpen) {
                              setPickerOpenId(null);
                              setPickerGlossaryId('');
                            } else {
                              setEditingId(null);
                              setPickerOpenId(entry.id);
                              setPickerGlossaryId(glossaries[0]?.id ?? '');
                            }
                          }}
                          title={t('library.addToGlossary')}
                          disabled={busyId !== null || isAdding || glossaries.length === 0}
                        >
                          {isAdding ? <Loader2 size={13} className="animate-spin" /> : <BookMarked size={13} />}
                        </IconButton>
                        <IconButton
                          size="sm"
                          onClick={() => startEdit(entry)}
                          title={t('common.edit')}
                          disabled={busyId !== null}
                        >
                          <Pencil size={13} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          tone="muted"
                          onClick={() => void handleDelete(entry)}
                          title={t('common.delete')}
                          disabled={busyId !== null}
                        >
                          {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </IconButton>
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="grid gap-3">
                    <MemoryTextarea
                      label={t('memory.sourcePhraseLabel')}
                      value={draftSource}
                      onChange={setDraftSource}
                      // eslint-disable-next-line jsx-a11y/no-autofocus -- form che compare da un click esplicito (nuova frase)
                      autoFocus
                    />
                    <MemoryTextarea
                      label={t('glossary.translation')}
                      value={draftTarget}
                      onChange={setDraftTarget}
                    />
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div className="border-l border-editorial-border/70 bg-editorial-textbox/18 px-4 py-3">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-muted">
                        {t('memory.sourcePhraseLabel')}
                      </div>
                      <p className="text-sm italic leading-relaxed text-editorial-ink">{entry.sourcePhrase}</p>
                    </div>
                    <div className="border-l border-editorial-success/45 bg-editorial-success/5 px-4 py-3">
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-success">
                        {t('glossary.translation')}
                      </div>
                      <p className="text-sm italic leading-relaxed text-editorial-ink">{entry.targetPhrase}</p>
                    </div>
                  </div>
                )}

                {isPickerOpen && (
                  <GlossaryPicker
                    glossaries={glossaries}
                    selectedId={pickerGlossaryId}
                    isAdding={isAdding}
                    onSelect={setPickerGlossaryId}
                    onConfirm={() => void handleAddToGlossary(entry, pickerGlossaryId)}
                    onCancel={() => { setPickerOpenId(null); setPickerGlossaryId(''); }}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Origin line ───────────────────────────────────────────────────────────────
// Single compact line: ProjectName · chunk:N · embeddingModel

function OriginLine({
  entry,
  projectNameMap,
  chunkPositionMap,
  workspaceEmbeddingModel,
}: {
  entry: PhraseMemoryEntry;
  projectNameMap: Record<string, string>;
  chunkPositionMap: Record<string, number>;
  workspaceEmbeddingModel: string | null;
}) {
  const parts: string[] = [];

  if (entry.projectId) {
    parts.push(projectNameMap[entry.projectId] ?? entry.projectId.slice(0, 8) + '…');
  }
  if (entry.chunkId) {
    const pos = chunkPositionMap[entry.chunkId];
    parts.push(pos !== undefined ? `chunk:${pos + 1}` : `chunk:${entry.chunkId.slice(0, 6)}…`);
  }
  if (entry.embeddingModel) {
    parts.push(entry.embeddingModel);
  }

  if (parts.length === 0) return null;

  const stale = entry.embeddingModel !== workspaceEmbeddingModel;
  return (
    <p className={`mt-1 font-mono text-[11px] ${stale ? 'text-editorial-accent/80' : 'text-editorial-muted/50'}`}>
      {parts.join(' · ')}
    </p>
  );
}

// ── Glossary picker ───────────────────────────────────────────────────────────

interface GlossaryPickerProps {
  glossaries: { id: string; name: string }[];
  selectedId: string;
  isAdding: boolean;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function GlossaryPicker({ glossaries, selectedId, isAdding, onSelect, onConfirm, onCancel }: GlossaryPickerProps) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-editorial-accent/30 pt-3">
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        disabled={isAdding}
        className="min-w-0 flex-1 rounded-md border border-editorial-border bg-editorial-bg px-3 py-1.5 text-xs text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-50"
        aria-label={t('glossary.selectGlossary')}
      >
        {glossaries.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <IconButton
        size="sm"
        tone="accent"
        onClick={onConfirm}
        title={t('common.confirm')}
        disabled={isAdding || !selectedId}
      >
        {isAdding ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
      </IconButton>
      <IconButton
        size="sm"
        onClick={onCancel}
        title={t('common.cancel')}
        disabled={isAdding}
      >
        <X size={13} />
      </IconButton>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function MemoryTextarea({
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-editorial-muted">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- il chiamante lo passa solo per il campo aperto da un click esplicito
        autoFocus={autoFocus}
        className="w-full resize-y rounded-md border border-editorial-border bg-editorial-bg/80 px-4 py-3 text-sm leading-relaxed text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
      />
    </label>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function workspaceName(workspaceId: string, workspaces: Workspace[]) {
  return workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId;
}
