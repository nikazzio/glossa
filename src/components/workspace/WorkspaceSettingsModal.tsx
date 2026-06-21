import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Brain, Cpu, Download, HardDrive, Loader2, RefreshCcw, Settings2, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { exportWorkspace, importWorkspace } from '../../services/backupService';
import { regenerateAllEmbeddings } from '../../services/phraseMemoryService';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { EditorialModalShell } from '../common';
import { IconButton, PillButton } from '../ui';
import { MemoryExtractorSettings } from './MemoryExtractorSettings';
import type { EmbeddingModel, ModelProvider } from '../../types';

type WorkspaceSettingsTab = 'general' | 'memory' | 'backup';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WorkspaceSettingsModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { activeWorkspace, updateActiveWorkspace } = useWorkspaceStore();
  const trapRef = useFocusTrap(open, onClose);

  const [activeTab, setActiveTab] = useState<WorkspaceSettingsTab>('general');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState<EmbeddingModel>('text-embedding-3-small');
  const [memoryExtractorProvider, setMemoryExtractorProvider] = useState<ModelProvider>('openai');
  const [memoryExtractorModel, setMemoryExtractorModel] = useState('gpt-5-nano');
  const [memoryExtractorPrompt, setMemoryExtractorPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    if (!open || !activeWorkspace) return;
    setName(activeWorkspace.name);
    setDescription(activeWorkspace.description ?? '');
    setEmbeddingModel(activeWorkspace.embeddingModel);
    setMemoryExtractorProvider(activeWorkspace.memoryExtractorProvider);
    setMemoryExtractorModel(activeWorkspace.memoryExtractorModel);
    setMemoryExtractorPrompt(activeWorkspace.memoryExtractorPrompt);
    setActiveTab('general');
  }, [open, activeWorkspace]);

  const handleSave = async () => {
    if (!name.trim()) return;
    if (activeTab === 'memory' && (!memoryExtractorModel.trim() || !memoryExtractorPrompt.trim())) return;
    setSaving(true);
    let shouldClose = false;
    try {
      const updates = activeTab === 'memory' ? {
        name: name.trim(),
        description: description.trim() || undefined,
        embeddingModel,
        memoryExtractorProvider,
        memoryExtractorModel: memoryExtractorModel.trim(),
        memoryExtractorPrompt: memoryExtractorPrompt.trim(),
      } : {
        name: name.trim(),
        description: description.trim() || undefined,
      };
      await updateActiveWorkspace(updates);
      toast.success(t('workspace.updated'));
      shouldClose = true;
    } catch (err: unknown) {
      toast.error(t('workspace.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
      if (shouldClose) onClose();
    }
  };

  const handleRegenerateEmbeddings = async () => {
    if (!activeWorkspace) return;
    setIsRegenerating(true);
    try {
      const count = await regenerateAllEmbeddings(activeWorkspace.id, embeddingModel);
      toast.success(t('workspace.embeddingsRegenerated', { count }));
    } catch (err: unknown) {
      toast.error(t('workspace.embeddingsRegenerateFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleExportBackup = async () => {
    setIsBackupBusy(true);
    try {
      await exportWorkspace();
      toast.success(t('files.backupExportSuccess'));
    } catch (err: unknown) {
      toast.error(t('files.backupInvalidFile'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleImportBackup = async () => {
    setIsBackupBusy(true);
    try {
      const restored = await importWorkspace(t);
      if (restored) {
        toast.success(t('files.backupImportSuccess'));
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const key =
        msg === 'incompatible_schema_version'
          ? 'files.backupIncompatibleVersion'
          : 'files.backupInvalidFile';
      toast.error(t(key), { description: msg });
    } finally {
      setIsBackupBusy(false);
    }
  };

  const tabConfig: Array<{ id: WorkspaceSettingsTab; icon: ReactNode; label: string }> = [
    { id: 'general', icon: <Settings2 size={14} />, label: t('workspace.settings.generalTab') },
    { id: 'memory', icon: <Brain size={14} />, label: t('workspace.settings.memoryTab') },
    { id: 'backup', icon: <HardDrive size={14} />, label: t('workspace.settings.backupTab') },
  ];

  const tabBar = (
    <div className="flex items-center gap-2" role="tablist" aria-label={t('workspace.settings.eyebrow')}>
      {tabConfig.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <IconButton
            key={tab.id}
            id={`workspace-settings-tab-${tab.id}`}
            size="md"
            tone={isActive ? 'accent' : 'default'}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            role="tab"
            aria-selected={isActive}
            aria-controls={`workspace-settings-panel-${tab.id}`}
          >
            {tab.icon}
          </IconButton>
        );
      })}
      <span className="mx-1 h-4 w-px shrink-0 self-center bg-editorial-border/70" aria-hidden="true" />
      <span className="self-center font-display text-sm italic text-editorial-ink">
        {tabConfig.find((tb) => tb.id === activeTab)?.label}
      </span>
    </div>
  );

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workspace-settings-title"
          ref={trapRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-editorial-ink/35 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative w-full max-w-xl"
          >
            <EditorialModalShell
              titleId="workspace-settings-title"
              title={activeWorkspace?.name ?? t('workspace.noActive')}
              eyebrow={t('workspace.settings.eyebrow')}
              closeLabel={t('settings.close')}
              onClose={onClose}
              widthClassName="max-w-xl"
              bodyClassName="px-6 py-6 md:px-8"
              panelClassName="h-[80vh]"
              tabBar={tabBar}
              footer={
                activeTab === 'general' || activeTab === 'memory' ? (
                  <div className="flex justify-end">
                    <PillButton
                      onClick={() => void handleSave()}
                      disabled={!name.trim() || saving || (activeTab === 'memory' && (!memoryExtractorModel.trim() || !memoryExtractorPrompt.trim()))}
                      variant="accent"
                      className="px-5 py-3"
                    >
                      {saving ? t('workspace.saving') : t('common.save')}
                    </PillButton>
                  </div>
                ) : null
              }
            >
              {activeTab === 'general' && (
                <div
                  id="workspace-settings-panel-general"
                  role="tabpanel"
                  aria-labelledby="workspace-settings-tab-general"
                  className="space-y-4"
                >
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('workspace.namePlaceholder')}
                    className="w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                    autoFocus
                  />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('workspace.descriptionPlaceholder')}
                    className="min-h-24 w-full rounded-[18px] border border-editorial-border bg-editorial-textbox/30 px-4 py-3 text-sm text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  />
                </div>
              )}

              {activeTab === 'memory' && (
                <div
                  id="workspace-settings-panel-memory"
                  role="tabpanel"
                  aria-labelledby="workspace-settings-tab-memory"
                  className="space-y-4"
                >
                  <div className="space-y-3 rounded-[20px] border border-editorial-border bg-editorial-bg/70 px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <Cpu size={11} className="shrink-0 text-editorial-accent" />
                      <p className="text-xs font-sans uppercase tracking-[0.22em] text-editorial-muted">
                        {t('workspace.embeddingModel')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={embeddingModel}
                        onChange={(e) => setEmbeddingModel(e.target.value as EmbeddingModel)}
                        className="flex-1 rounded-[12px] border border-editorial-border/60 bg-editorial-textbox/60 px-3 py-2 text-xs font-mono text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                      >
                        <option value="text-embedding-3-small">text-embedding-3-small</option>
                        <option value="text-embedding-3-large">text-embedding-3-large</option>
                      </select>
                      <IconButton
                        size="md"
                        tone="default"
                        onClick={() => void handleRegenerateEmbeddings()}
                        disabled={isRegenerating || !activeWorkspace || embeddingModel === activeWorkspace?.embeddingModel}
                        title={t('workspace.regenerateEmbeddings')}
                        tooltipSide="top"
                      >
                        {isRegenerating
                          ? <Loader2 size={13} className="animate-spin" />
                          : <RefreshCcw size={13} />}
                      </IconButton>
                    </div>
                    {embeddingModel !== activeWorkspace?.embeddingModel && (
                      <p className="rounded-lg border border-editorial-accent/30 bg-editorial-accent/8 px-3 py-2 text-sm leading-relaxed text-editorial-accent [text-wrap:pretty]">
                        {t('workspace.embeddingChangeWarning')}
                      </p>
                    )}
                  </div>
                  <MemoryExtractorSettings
                    provider={memoryExtractorProvider}
                    model={memoryExtractorModel}
                    prompt={memoryExtractorPrompt}
                    onProviderChange={(provider, model) => {
                      setMemoryExtractorProvider(provider);
                      setMemoryExtractorModel(model);
                    }}
                    onModelChange={setMemoryExtractorModel}
                    onPromptChange={setMemoryExtractorPrompt}
                  />
                </div>
              )}

              {activeTab === 'backup' && (
                <div
                  id="workspace-settings-panel-backup"
                  role="tabpanel"
                  aria-labelledby="workspace-settings-tab-backup"
                  className="space-y-6"
                >
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-editorial-muted">
                      {t('settings.backup')}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
                      {t('settings.backupHint')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleExportBackup()}
                      disabled={isBackupBusy}
                      className="flex items-center gap-2 rounded-full border border-editorial-border px-4 py-2 text-xs font-bold uppercase tracking-widest text-editorial-muted transition-colors duration-150 hover:border-editorial-ink/60 hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Download size={13} />
                      {t('settings.backupExport')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleImportBackup()}
                      disabled={isBackupBusy}
                      className="flex items-center gap-2 rounded-full border border-editorial-border px-4 py-2 text-xs font-bold uppercase tracking-widest text-editorial-muted transition-colors duration-150 hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Upload size={13} />
                      {t('settings.backupImport')}
                    </button>
                  </div>
                </div>
              )}
            </EditorialModalShell>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
