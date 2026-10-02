import { BookMarked, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FewShotExample } from '../../types';
import { FIELD_CLASSNAME, FIELD_INLINE_CLASSNAME, FieldLabel, IconButton, PanelSection } from '../ui';

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
    <PanelSection icon={BookMarked} label={t('settings.fewShotTab')}>
      {examples.length === 0 ? (
        <p className="text-xs text-editorial-muted">{t('settings.fewShotEmptyHint')}</p>
      ) : (
        <div className="divide-y divide-rule border-y border-rule">
          {examples.map((example) => (
            <div key={example.id} className="space-y-2 py-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={example.label ?? ''}
                  onChange={(e) => updateExample(example.id, { label: e.target.value })}
                  disabled={disabled}
                  placeholder={t('settings.fewShotLabelPlaceholder')}
                  aria-label={t('settings.fewShotLabelPlaceholder')}
                  className={`${FIELD_INLINE_CLASSNAME} min-w-0 flex-1`}
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
              <FieldLabel htmlFor={`few-shot-source-${example.id}`} block>{t('settings.fewShotSourceLabel')}</FieldLabel>
              <textarea
                id={`few-shot-source-${example.id}`}
                value={example.sourceText}
                onChange={(e) => updateExample(example.id, { sourceText: e.target.value })}
                disabled={disabled}
                rows={2}
                className={`${FIELD_CLASSNAME} resize-y leading-relaxed`}
              />
              <FieldLabel htmlFor={`few-shot-target-${example.id}`} block>{t('settings.fewShotTargetLabel')}</FieldLabel>
              <textarea
                id={`few-shot-target-${example.id}`}
                value={example.targetText}
                onChange={(e) => updateExample(example.id, { targetText: e.target.value })}
                disabled={disabled}
                rows={2}
                className={`${FIELD_CLASSNAME} resize-y leading-relaxed`}
              />
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  );
}
