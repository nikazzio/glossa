import { DollarSign, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MODEL_PRICING } from '../../constants';
import { MODEL_CATALOG } from '../../models/catalog';
import { usePricingStore } from '../../stores/pricingStore';
import { FIELD_MONO_CLASSNAME, FieldLabel, IconButton, PanelSection } from '../ui';

/** Listino personale: prezzi per milione di token che sostituiscono quelli del catalogo nei costi stimati. */
export function PricingOverridesSection() {
  const { t } = useTranslation();
  const { overrides, setOverride, resetOverride, resetAll } = usePricingStore();
  return (
    <PanelSection icon={DollarSign} label={t('cost.pricingOverrides')} hint={t('cost.overrideHint')}
      actions={Object.keys(overrides).length > 0 && (
        <IconButton size="sm" onClick={resetAll} title={t('cost.resetAll')}>
          <RotateCcw size={13} />
        </IconButton>
      )}>
      <div className="overflow-x-auto border-b border-rule">
        <table className="w-full">
          <thead>
            <tr className="border-b border-rule">
              <th className="px-1 py-2 text-left">
                <FieldLabel>{t('cost.overrideModel')}</FieldLabel>
              </th>
              <th className="px-1 py-2 text-right">
                <FieldLabel>{t('cost.overrideInput')}</FieldLabel>
              </th>
              <th className="px-1 py-2 text-right">
                <FieldLabel>{t('cost.overrideOutput')}</FieldLabel>
              </th>
              <th className="px-1 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {MODEL_CATALOG.filter((e) => e.pricing).map((entry) => {
              const key = `${entry.provider}/${entry.id}`;
              const current = overrides[key] ?? MODEL_PRICING[key] ?? entry.pricing!;
              const isOverridden = !!overrides[key];
              return (
                <tr key={key}>
                  <td className="px-1 py-2">
                    <span
                      className={`font-mono text-sm ${
                        isOverridden ? 'text-editorial-ink' : 'text-editorial-muted'
                      }`}
                    >
                      {entry.provider}/{entry.id}
                    </span>
                  </td>
                  <td className="px-1 py-2 text-right">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={current.input}
                      aria-label={`${key} — ${t('cost.overrideInput')}`}
                      onChange={(e) =>
                        setOverride(key, { ...current, input: parseFloat(e.target.value) || 0 })
                      }
                      className={`${FIELD_MONO_CLASSNAME} w-24 text-right`}
                    />
                  </td>
                  <td className="px-1 py-2 text-right">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={current.output}
                      aria-label={`${key} — ${t('cost.overrideOutput')}`}
                      onChange={(e) =>
                        setOverride(key, {
                          ...current,
                          output: parseFloat(e.target.value) || 0,
                        })
                      }
                      className={`${FIELD_MONO_CLASSNAME} w-24 text-right`}
                    />
                  </td>
                  <td className="px-1 py-2 text-right">
                    {isOverridden && (
                      <IconButton
                        size="sm"
                        onClick={() => resetOverride(key)}
                        title={t('cost.resetOverride')}
                      >
                        <RotateCcw size={13} />
                      </IconButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PanelSection>
  );
}
