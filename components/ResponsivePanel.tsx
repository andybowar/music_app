'use client';

import { isValidElement, useId, useRef, useState, type ReactNode } from 'react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DESKTOP_QUERY, useMediaQuery } from '@/components/ui/use-media-query';

export type ResponsivePanelProps = {
  /** The control that opens the panel. A single element (e.g. a `<button>`) is used as-is. */
  trigger?: ReactNode;
  /**
   * Without a `trigger`: what the popover is positioned against (e.g. a whole `SongRow`).
   * Rendered as-is; it does not open the panel itself.
   */
  anchor?: ReactNode;
  /** Controlled open state; pass with `onOpenChange` to open the panel from a callback. */
  open?: boolean;
  onOpenChange?(open: boolean): void;
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
 * Controlled without a trigger (`open` + `onOpenChange`, optional `anchor`), focus returns on
 * close to whatever was focused when it opened, e.g. the row button whose callback opened it.
 */
export function ResponsivePanel({
  trigger,
  anchor,
  open: openProp,
  onOpenChange,
  title,
  children,
}: ResponsivePanelProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };
  const isDesktop = useMediaQuery(DESKTOP_QUERY, false);
  const titleId = useId();
  const returnFocus = useRef<HTMLElement | null>(null);
  const hasTrigger = trigger !== undefined;

  // `asChild` needs a single element; wrap text or fragments in a real button.
  const triggerChild = isValidElement(trigger) ? (
    trigger
  ) : (
    <button type="button" className={fallbackTriggerClass}>
      {trigger}
    </button>
  );

  // Radix returns focus to its trigger; with none, return it to the opener ourselves.
  const focusProps = hasTrigger
    ? {}
    : {
        onOpenAutoFocus: () => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        },
        onCloseAutoFocus: (e: Event) => {
          if (!returnFocus.current?.isConnected) return;
          e.preventDefault();
          returnFocus.current.focus();
        },
      };

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        {hasTrigger ? (
          <PopoverTrigger asChild>{triggerChild}</PopoverTrigger>
        ) : (
          <PopoverAnchor asChild={isValidElement(anchor)}>{anchor}</PopoverAnchor>
        )}
        <PopoverContent
          {...focusProps}
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
      {hasTrigger ? <SheetTrigger asChild>{triggerChild}</SheetTrigger> : anchor}
      <SheetContent
        {...focusProps}
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
