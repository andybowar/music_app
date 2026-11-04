'use client';

import { FileStackIcon, GuitarIcon, MicVocalIcon, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { PLAYER_ROLES, ROLE_HINT, ROLE_LABEL, type PlayerRole } from './playerPrefs';

const ROLE_ICON: Record<PlayerRole, LucideIcon> = {
  musician: GuitarIcon,
  vocalist: MicVocalIcon,
  projectionist: FileStackIcon,
};

export interface StartEventDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onStart(role: PlayerRole): void;
}

/** Asks who's playing before the set player opens (LIST-11). Asked every time, no default. */
export function StartEventDialog({ open, onOpenChange, onStart }: StartEventDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start event</DialogTitle>
          <DialogDescription>What are you doing in this set?</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {PLAYER_ROLES.map((role) => {
            const Icon = ROLE_ICON[role];
            return (
              <li key={role}>
                <Button
                  variant="outline"
                  className="h-auto min-h-tap w-full justify-start gap-3 py-3 text-left whitespace-normal"
                  onClick={() => onStart(role)}
                >
                  <Icon aria-hidden className="size-5 shrink-0" />
                  <span className="flex flex-col">
                    <span className="text-base font-semibold">{ROLE_LABEL[role]}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {ROLE_HINT[role]}
                    </span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
