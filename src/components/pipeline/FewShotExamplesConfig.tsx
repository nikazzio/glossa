import { BookMarked, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FewShotExample } from '../../types';
import { IconButton, SectionLabel } from '../ui';

interface FewShotExamplesConfigProps {
  examples: FewShotExample[];
  onChange: (examples: FewShotExample[]) => void;
  disabled?: boolean;
}

export function FewShotExamplesConfig({ examples, onChange, disabled = false }: FewShotExamplesConfigProps) {
  const { t } = useTranslation();

  const updateExample = (id: string, patch: Partial<FewShotExample>) =>
    onChange(examples.map((example) => (example.id === id ? { ...example, ...patch } : example)));

  const removeExample = (id: string) => onChange(examples.filter((example) => example.id !== id));

  return (
    <div className="space-y-3">
      <SectionLabel icon={BookMarked} label={t('settings.fewShotTab')} />

      <div className="space-y-3 border-l-4 border-l-editorial-accent/35 border-y border-editorial-border/70 bg-editorial-bg/65 px-5 py-4">
        {examples.length === 0 ? (
          <p className="text-xs leading-relaxed text-editorial-muted/70">{t('settings.fewShotEmptyHint')}</p>
        ) : (
          examples.map((example) => (
            <div key={example.id} className="space-y-2 border border-editorial-border/60 bg-editorial-bg/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={example.label ?? ''}
                  onChange={(e) => updateExample(example.id, { label: e.target.value })}
                  disabled={disabled}
                  placeholder={t('settings.fewShotLabelPlaceholder')}
                  className="w-full bg-transparent text-xs font-sans uppercase tracking-[0.18em] text-editorial-muted outline-none disabled:opacity-40"
                />
                <IconButton
                  size="sm"
                  tone="danger"
                  onClick={() => removeExample(example.id)}
                  disabled={disabled}
                  title={t('settings.fewShotRemoveButton')}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-sans uppercase tracking-[0.18em] text-editorial-muted">
                  {t('settings.fewShotSourceLabel')}
                </label>
                <textarea
                  value={example.sourceText}
                  onChange={(e) => updateExample(example.id, { sourceText: e.target.value })}
                  disabled={disabled}
                  rows={2}
                  className="w-full resize-y rounded-md border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-sans uppercase tracking-[0.18em] text-editorial-muted">
                  {t('settings.fewShotTargetLabel')}
                </label>
                <textarea
                  value={example.targetText}
                  onChange={(e) => updateExample(example.id, { targetText: e.target.value })}
                  disabled={disabled}
                  rows={2}
                  className="w-full resize-y rounded-md border border-editorial-border bg-editorial-bg/80 px-3 py-2 text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:opacity-40"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
