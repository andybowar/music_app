'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ResponsivePanel } from '@/components/ResponsivePanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ENERGY_FOREGROUND_HEX,
  ENERGY_RING,
  ENERGY_TOKEN,
  POP_TOKEN,
  ROW_TOKEN,
  contrastRatio,
} from '@/components/ui/tokens';
import { cn } from '@/components/ui/utils';
import { DESKTOP_QUERY, useMediaQuery } from '@/components/ui/use-media-query';
import { ENERGY_LEVELS, ENERGY_META } from '@/types/domain';

const ROW_HEX = '#2B2B2B';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function TokensGallery() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [view, setView] = useState('arrangement');

  return (
    <TooltipProvider>
      <main className="mx-auto max-w-4xl space-y-10 px-4 py-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Design tokens and UI primitives</h1>
          <p className="text-sm text-muted-foreground">
            UI-01 gallery. Panel mode right now:{' '}
            <strong data-testid="panel-mode">{isDesktop ? 'popover' : 'sheet'}</strong> (switches at
            768px).
          </p>
        </header>

        <Section title="Energy">
          <ul className="grid gap-2 sm:grid-cols-2">
            {ENERGY_LEVELS.map((level) => {
              const t = ENERGY_TOKEN[level];
              const meta = ENERGY_META[level];
              return (
                <li key={level} className={cn(ROW_TOKEN.surface, 'flex items-center gap-3 p-2')}>
                  <span
                    className={cn(
                      t.bg,
                      t.fg,
                      ENERGY_RING,
                      ROW_TOKEN.chipRadius,
                      'inline-flex h-tap min-w-17 items-center justify-center px-2 text-sm font-semibold',
                    )}
                  >
                    {meta.color}
                  </span>
                  <span className="text-sm">
                    {meta.label}
                    <br />
                    <span className="text-xs opacity-80">
                      {meta.hex} · label{' '}
                      {contrastRatio(meta.hex, ENERGY_FOREGROUND_HEX[level]).toFixed(2)}:1 · row{' '}
                      {contrastRatio(meta.hex, ROW_HEX).toFixed(2)}:1
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Song row and POP composers">
          <div className={cn(ROW_TOKEN.surface, 'space-y-1 p-3')}>
            <p className={ROW_TOKEN.title}>Sample song title</p>
            <p className="text-sm">
              <span className={POP_TOKEN.current.text} title={POP_TOKEN.current.title}>
                Current member
              </span>
              {' · '}
              <span className={POP_TOKEN.past.text} title={POP_TOKEN.past.title}>
                Past member
              </span>
              {' · '}
              <span>Not a member</span> · 2021
            </p>
          </div>
          <p className="text-sm">
            On light surfaces:{' '}
            <span className={POP_TOKEN.current.textOnLight} title={POP_TOKEN.current.title}>
              Current member
            </span>
            {' · '}
            <span className={POP_TOKEN.past.textOnLight} title={POP_TOKEN.past.title}>
              Past member
            </span>
          </p>
        </Section>

        <Section title="ResponsivePanel">
          <div className="flex flex-wrap gap-2">
            <ResponsivePanel trigger={<Button variant="outline">Key D</Button>} title="Keys">
              <p className="text-sm">Popover at 768px and up, bottom sheet below.</p>
              <Button size="sm" className="mt-3">
                Focusable action
              </Button>
            </ResponsivePanel>
            <ResponsivePanel trigger="Usage" title="Usage by branch">
              <p className="text-sm">Text triggers are wrapped in a button.</p>
            </ResponsivePanel>
          </div>
        </Section>

        <Section title="Buttons and badges">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
            <Badge>Badge</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </Section>

        <Section title="Form controls">
          <div className="grid max-w-md gap-3">
            <Input aria-label="Title" placeholder="Title" />
            <Input aria-label="Invalid" aria-invalid placeholder="Invalid" />
            <Textarea aria-label="Notes" placeholder="Notes" />
            <Select>
              <SelectTrigger aria-label="Key" className="w-40">
                <SelectValue placeholder="Key" />
              </SelectTrigger>
              <SelectContent>
                {['C', 'D', 'E', 'F', 'G'].map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox /> Include past members
            </label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={view}
              onValueChange={(v) => v && setView(v)}
              aria-label="Lyrics view"
            >
              <ToggleGroupItem value="arrangement">Arrangement</ToggleGroupItem>
              <ToggleGroupItem value="sections">Sections</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </Section>

        <Section title="Overlays">
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create setlist</DialogTitle>
                  <DialogDescription>Dialog primitive sample.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Popover</Button>
              </PopoverTrigger>
              <PopoverContent className="text-sm">Popover primitive sample.</PopoverContent>
            </Popover>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">Sheet</Button>
              </SheetTrigger>
              <SheetContent side="bottom">
                <SheetHeader>
                  <SheetTitle>Sheet</SheetTitle>
                  <SheetDescription>Sheet primitive sample.</SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Add to</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Current setlist</DropdownMenuItem>
                <DropdownMenuItem>New setlist…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Tooltip</Button>
              </TooltipTrigger>
              <TooltipContent>Tooltip sample</TooltipContent>
            </Tooltip>
            <Button variant="outline" onClick={() => toast.success('Saved')}>
              Toast success
            </Button>
            <Button variant="outline" onClick={() => toast.error('Could not save')}>
              Toast error
            </Button>
          </div>
        </Section>

        <Section title="Tabs and command">
          <Tabs defaultValue="details" className="max-w-md">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="text-sm">
              Details tab
            </TabsContent>
            <TabsContent value="history" className="text-sm">
              History tab
            </TabsContent>
          </Tabs>
          <Command className="max-w-md rounded-md border">
            <CommandInput placeholder="Search themes…" />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup heading="Themes">
                <CommandItem>Praise</CommandItem>
                <CommandItem>Thanksgiving</CommandItem>
                <CommandItem>Holy Spirit</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </Section>

        <Section title="Skeleton">
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        </Section>
      </main>
      <Toaster />
    </TooltipProvider>
  );
}
