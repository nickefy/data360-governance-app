import type { ReactNode } from 'react';
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@databricks/appkit-ui/react';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextField({ label, value, onChange, hint, placeholder, disabled, multiline }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string; disabled?: boolean; multiline?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      {multiline ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} rows={3} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
      )}
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, hint, disabled, allowAll }: {
  label: string; value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[];
  hint?: string; disabled?: boolean; allowAll?: string;
}) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <Field label={label} hint={hint}>
      <Select value={value === '' && allowAll ? '__all' : value} onValueChange={(x) => onChange(x === '__all' ? '' : x)} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={allowAll ?? 'Select…'} />
        </SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value="__all">{allowAll}</SelectItem>}
          {opts.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export const STATUSES = ['Draft', 'Pending Approval', 'Approved', 'Rejected', 'Retired'];
export const DIMENSIONS = ['Completeness', 'Validity', 'Uniqueness', 'Consistency', 'Timeliness', 'Accuracy'];
export const RULE_TYPES = [
  { value: 'not_null_or_blank', label: 'Not null / not blank' },
  { value: 'regex', label: 'Format (regular expression)' },
  { value: 'in_reference', label: 'Value in reference data' },
  { value: 'unique', label: 'Unique values' },
  { value: 'range', label: 'Value range' },
  { value: 'sql_expr', label: 'Custom SQL expression' },
];
export { OWNER_OPTIONS } from '../lib/app-context';
