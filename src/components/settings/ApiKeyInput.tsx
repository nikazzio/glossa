import { Key, CheckCircle2 } from 'lucide-react';

interface ApiKeyInputProps {
  label: string;
  envKey: string;
}

export function ApiKeyInput({ label, envKey }: ApiKeyInputProps) {
  const isSet = process.env[envKey] || (import.meta as any).env[`VITE_${envKey}`];

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-bold uppercase text-editorial-muted">{label}</span>
      <div className="flex items-center gap-3 bg-editorial-textbox px-3 py-2">
        <Key size={14} className={isSet ? 'text-editorial-accent' : 'text-editorial-muted opacity-20'} />
        <span className="flex-1 text-[10px] font-mono truncate">
          {isSet ? '••••••••••••••••' : 'Not configured'}
        </span>
        {isSet && <CheckCircle2 size={12} className="text-editorial-ink" />}
      </div>
    </div>
  );
}
