import { useEffect, useState } from 'react';
import { BookCopy, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listGlossaries } from '../../services/glossaryService';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { Glossary } from '../../types';
import { Dialog, DialogCancelButton, DialogConfirmButton, Spinner } from '../ui';

interface CopyGlossaryDialogProps {
  open: boolean;
  destinationWorkspaceId: string;
  onClose: () => void;
  onCopy: (source: Glossary, name: string) => Promise<void>;
}

export function CopyGlossaryDialog({
  open,
  destinationWorkspaceId,
  onClose,
  onCopy,
}: CopyGlossaryDialogProps) {
  const { t } = useTranslation();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const [sources, setSources] = useState<Glossary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setSelectedId(null);
    setName('');
    void listGlossaries()
      .then((glossaries) => setSources(glossaries.filter((item) => item.workspaceId !== destinationWorkspaceId)))
      .finally(() => setIsLoading(false));
  }, [open, destinationWorkspaceId]);

  const selectSource = (source: Glossary) => {
    setSelectedId(source.id);
    setName(`${source.name} (${t('library.copySuffix')})`);
  };

  const handleCopy = async () => {
    const source = sources.find((item) => item.id === selectedId);
    if (!source || !name.trim()) return;
    setIsCopying(true);
    try {
      await onCopy(source, name.trim());
      onClose();
    } catch {
      // Il chiamante mostra gia' un errore contestuale e lascia aperta la finestra.
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen && !isCopying) onClose(); }}
      title={t('library.copyExistingDictionary')}
      closeLabel={t('common.cancel')}
      icon={<BookCopy size={20} />}
      widthClassName="max-w-lg"
      bodyClassName="px-5 py-5"
      footer={
        <div className="flex justify-end gap-2">
          <DialogCancelButton onClick={onClose} disabled={isCopying}>{t('common.cancel')}</DialogCancelButton>
          <DialogConfirmButton onClick={() => void handleCopy()} disabled={!selectedId || !name.trim() || isCopying}>
            {isCopying ? <Loader2 size={14} className="animate-spin" /> : t('library.copyDictionary')}
          </DialogConfirmButton>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-editorial-muted [text-wrap:pretty]">
          {t('library.copyExistingDictionaryHint')}
        </p>
        {isLoading ? (
          <Spinner size={14} label={t('common.loading')} className="py-6" />
        ) : sources.length === 0 ? (
          <p className="border-y border-dashed border-editorial-border/70 py-6 text-center text-sm italic text-editorial-muted">
            {t('library.noOtherWorkspaceDictionaries')}
          </p>
        ) : (
          <div className="max-h-56 space-y-1 overflow-y-auto border-y border-editorial-border/70 py-2 custom-scrollbar">
            {sources.map((source) => {
              const owner = workspaces.find((workspace) => workspace.id === source.workspaceId);
              const selected = source.id === selectedId;
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => selectSource(source)}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                    selected ? 'bg-editorial-accent/10 text-editorial-accent' : 'hover:bg-editorial-textbox/30'
                  }`}
                >
                  <span className="truncate font-display text-base italic text-editorial-ink">{source.name}</span>
                  <span className="shrink-0 text-xs text-editorial-muted">{owner?.name ?? source.workspaceId}</span>
                </button>
              );
            })}
          </div>
        )}
        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">
            {t('library.dictionaryNameLabel')}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!selectedId || isCopying}
            className="w-full rounded-md border border-editorial-border bg-editorial-textbox/30 px-3 py-2.5 text-sm font-display italic text-editorial-ink outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-45"
          />
        </label>
      </div>
    </Dialog>
  );
}
