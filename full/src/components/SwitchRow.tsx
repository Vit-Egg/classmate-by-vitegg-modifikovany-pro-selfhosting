"use client";

/** Řádek s přepínačem (název, popisek, přepínač). Volitelně se odesílá s formulářem pod názvem `name`. */
export function SwitchRow({ label, hint, checked, onChange, name, value = "on", disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; name?: string; value?: string; disabled?: boolean }) {
  return (
    <div className="switch-row">
      <div>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
      {name && checked && <input type="hidden" name={name} value={value} />}
      <button type="button" className={`switch${checked ? " on" : ""}`} role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}>
        <i />
      </button>
    </div>
  );
}
