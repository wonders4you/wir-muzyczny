import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { PRESET_GROUPS, PRESETS } from "@/lib/presets";
import { cn } from "@/lib/utils";

type Props = {
  presetId: string | null;
  blurb: string;
  recentIds: string[];
  onPickCatalog: (id: string) => void;
  onPickRecent: (id: string) => void;
};

export function PresetPicker({
  presetId,
  blurb,
  recentIds,
  onPickCatalog,
  onPickRecent,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = PRESETS.find((p) => p.id === presetId);
  const label = current?.name ?? "Własne";
  const recents = recentIds
    .map((id) => PRESETS.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .slice(0, 6);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="min-w-0" ref={rootRef}>
      <Label className="mb-2 block">Presety</Label>
      {recents.length > 0 ? (
        <div className="mb-3 flex max-w-full gap-1.5 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
          {recents.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.blurb}
              onClick={() => onPickRecent(preset.id)}
              className={cn(
                "h-10 shrink-0 rounded-full px-3.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-(--motion-quick) ease-[var(--ease-out)]",
                presetId === preset.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground shadow-[var(--shadow-border)] hover:bg-secondary hover:text-foreground",
              )}
            >
              {preset.name}
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 text-left text-sm text-foreground shadow-[var(--shadow-border)] transition-[box-shadow] duration-(--motion-quick) ease-[var(--ease-out)] hover:shadow-[var(--shadow-border-hover)]"
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-quick) ease-[var(--ease-out)]",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Wszystkie presety"
          className="mt-1 max-h-72 overflow-y-auto rounded-md bg-popover p-1 shadow-[var(--shadow-border)]"
        >
          {PRESET_GROUPS.map((group) => {
            const items = PRESETS.filter((p) => p.group === group.id);
            return (
              <div key={group.id} className="py-1">
                <p className="px-2.5 py-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                  {group.name}
                </p>
                {items.map((preset) => {
                  const selected = presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      title={preset.blurb}
                      onClick={() => {
                        onPickCatalog(preset.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex h-10 w-full items-center justify-between gap-2 rounded-sm px-2.5 text-left text-sm transition-[color,background-color] duration-(--motion-quick) ease-[var(--ease-out)]",
                        selected
                          ? "bg-secondary text-foreground"
                          : "text-foreground hover:bg-secondary/70",
                      )}
                    >
                      <span className="min-w-0 truncate">{preset.name}</span>
                      {selected ? (
                        <Check className="size-4 shrink-0 text-foreground" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">{blurb}</p>
    </div>
  );
}
