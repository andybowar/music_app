'use client';

import { isValidElement, useId, useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DESKTOP_QUERY, useMediaQuery } from '@/components/ui/use-media-query';

export type ResponsivePanelProps = {
  /** The control that opens the panel. A single element (e.g. a `<button>`) is used as-is. */
  trigger: ReactNode;
  /** Accessible name of the panel; shown as its heading. */
  title: string;
  children: ReactNode;
};

const fallbackTriggerClass =
  'inline-flex min-h-tap min-w-tap items-center justify-center rounded-md px-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * Detail panel: a `Popover` at >= 768px and a bottom `Sheet` below (contracts/ui.md).
 * Radix moves focus into the panel on open, traps it in the sheet, closes on Escape and returns
 * focus to the trigger. Open state is shared, so resizing across 768px keeps the panel open.
 * Server render and hydration use the sheet (mobile-first); the real mode applies right after.
 */
export function ResponsivePanel({ trigger, title, children }: ResponsivePanelProps) {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery(DESKTOP_QUERY, false);
  const titleId = useId();

  // `asChild` needs a single element; wrap text or fragments in a real button.
  const triggerChild = isValidElement(trigger) ? (
    trigger
  ) : (
    <button type="button" className={fallbackTriggerClass}>
      {trigger}
    </button>
  );

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{triggerChild}</PopoverTrigger>
        <PopoverContent
          aria-labelledby={titleId}
          data-mode="popover"
          className="max-h-[min(32rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto"
        >
          <h2 id={titleId} className="mb-2 text-sm font-semibold">
            {title}
          </h2>
          {children}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{triggerChild}</SheetTrigger>
      <SheetContent
        side="bottom"
        data-mode="sheet"
        aria-describedby={undefined}
        className="max-h-[85dvh] gap-0 rounded-t-lg pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="pr-12">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
