import { useEffect, useState } from 'react';
import { BookCopy, Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listGlossaries } from '../../services/glossaryService';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import type { Glossary } from '../../types';
import { Dialog, DialogCancelButton, DialogConfirmButton, FieldLabel, Hint, PopoverItem, Spinner } from '../ui';
import { reportUiError } from '../../utils/reportUiError';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';

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
    let cancelled = false;
    void listGlossaries()
      .then((glossaries) => { if (!cancelled) setSources(glossaries.filter((item) => item.workspaceId !== destinationWorkspaceId)); })
      .catch((error: unknown) => { if (!cancelled) { setSources([]); reportUiError(t('library.dictionaryLoadError'), error); } })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [open, destinationWorkspaceId, t]);

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
      compact
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen && !isCopying) onClose(); }}
      title={t('library.copyExistingDictionary')}
      closeLabel={t('common.cancel')}
      icon={<BookCopy size={20} />}
      widthClassName="max-w-lg"
      bodyClassName="px-6 py-4"
      closeDisabled={isCopying}
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
        <Hint label={t('library.copyExistingDictionaryHint')} />
        {isLoading ? (
          <Spinner size={14} label={t('common.loading')} className="py-6" />
        ) : sources.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-editorial-muted">
            {t('library.noOtherWorkspaceDictionaries')}
          </p>
        ) : (
          <div className="max-h-56 space-y-1 overflow-y-auto custom-scrollbar">
            {sources.map((source) => {
              const owner = workspaces.find((workspace) => workspace.id === source.workspaceId);
              const selected = source.id === selectedId;
              return (
                <div key={source.id} className={`flex items-center rounded-md ${selected ? 'bg-editorial-accent/10' : ''}`}>
                  <PopoverItem label={source.name} description={owner?.name ?? t('memory.provenance.unknownWorkspace')} disabled={isCopying} onSelect={() => selectSource(source)} />
                  {selected && <Check size={14} className="mr-3 shrink-0 text-editorial-accent" aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        )}
        <div className="space-y-1.5">
          <FieldLabel block htmlFor="copy-dictionary-name">{t('library.dictionaryNameLabel')}</FieldLabel>
          <input id="copy-dictionary-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!selectedId || isCopying}
            className={`${FIELD_CLASSNAME} font-display italic`}
          />
        </div>
      </div>
    </Dialog>
  );
}
