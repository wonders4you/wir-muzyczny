import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-md bg-muted px-3 font-mono text-sm text-foreground shadow-[var(--shadow-border)] outline-none transition-[box-shadow,background-color] duration-(--motion-quick) ease-[var(--ease-out)] placeholder:text-muted-foreground/70 focus-visible:shadow-[var(--shadow-border-hover)] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
