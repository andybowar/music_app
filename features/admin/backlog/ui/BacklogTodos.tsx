'use client';

import { Trash2 } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { addTodo, deleteTodo, updateTodo } from '@/features/admin/backlog/server';

import { TITLE_MAX, todoInputSchema, type AdminTodo, type TodoActions } from '../types';

export interface BacklogTodosProps {
  todos: AdminTodo[];
  actions?: Partial<TodoActions>;
}

const DEFAULT_ACTIONS: TodoActions = { addTodo, updateTodo, deleteTodo };

let tempSeq = 0;
const tempId = () => `pending-${++tempSeq}`;

/**
 * Admin › To-dos (ADM-06, REQ-ADM-01): a shared checklist. Adding, ticking and deleting are
 * optimistic and rolled back (with a toast) when the server refuses. A deleted item can be
 * restored from the toast's Undo.
 */
export function BacklogTodos({ todos, actions }: BacklogTodosProps) {
  const api: TodoActions = { ...DEFAULT_ACTIONS, ...actions };
  const [items, setItems] = useState<AdminTodo[]>(todos);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();

  const open = items.filter((t) => t.doneAt === null);
  const done = items
    .filter((t) => t.doneAt !== null)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));

  const replace = (id: string, next: AdminTodo | null) =>
    setItems((list) =>
      next === null ? list.filter((t) => t.id !== id) : list.map((t) => (t.id === id ? next : t)),
    );

  async function add(e: FormEvent) {
    e.preventDefault();
    const parsed = todoInputSchema.safeParse({ title });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a to-do');
      inputRef.current?.focus();
      return;
    }
    setError(null);
    const now = new Date().toISOString();
    const optimistic: AdminTodo = {
      id: tempId(),
      title: parsed.data.title,
      notes: null,
      doneAt: null,
      doneBy: null,
      createdBy: '',
      createdAt: now,
      updatedAt: now,
    };
    setItems((list) => [...list, optimistic]);
    setTitle('');
    const result = await api.addTodo({ title: parsed.data.title });
    if (result.ok) {
      replace(optimistic.id, result.data);
    } else {
      replace(optimistic.id, null);
      setTitle((current) => current || parsed.data.title);
      toast.error(`Couldn't add the to-do. ${result.error.message}`);
    }
  }

  async function toggle(todo: AdminTodo, checked: boolean) {
    if (todo.id.startsWith('pending-')) return;
    replace(todo.id, {
      ...todo,
      doneAt: checked ? new Date().toISOString() : null,
      doneBy: checked ? todo.doneBy : null,
    });
    const result = await api.updateTodo(todo.id, { done: checked });
    if (result.ok) {
      replace(todo.id, result.data);
    } else {
      replace(todo.id, todo);
      toast.error(`Couldn't update “${todo.title}”. ${result.error.message}`);
    }
  }

  async function restore(todo: AdminTodo, index: number) {
    const result = await api.addTodo({ title: todo.title, notes: todo.notes });
    if (!result.ok) {
      toast.error(`Couldn't restore “${todo.title}”. ${result.error.message}`);
      return;
    }
    let restored = result.data;
    if (todo.doneAt !== null) {
      const ticked = await api.updateTodo(restored.id, { done: true });
      if (ticked.ok) restored = ticked.data;
    }
    setItems((list) => {
      const next = [...list];
      next.splice(Math.min(index, next.length), 0, restored);
      return next;
    });
  }

  async function remove(todo: AdminTodo) {
    if (todo.id.startsWith('pending-')) return;
    const index = items.findIndex((t) => t.id === todo.id);
    replace(todo.id, null);
    const result = await api.deleteTodo(todo.id);
    if (!result.ok) {
      setItems((list) => {
        const next = [...list];
        next.splice(Math.min(index, next.length), 0, todo);
        return next;
      });
      toast.error(`Couldn't delete “${todo.title}”. ${result.error.message}`);
      return;
    }
    toast.success(`Deleted “${todo.title}”`, {
      action: { label: 'Undo', onClick: () => void restore(todo, index) },
    });
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={add} className="grid gap-1" noValidate>
        <label htmlFor={inputId} className="text-sm font-medium">
          New to-do
        </label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            ref={inputRef}
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="min-h-tap min-w-0 flex-1"
          />
          <Button type="submit" className="min-h-tap">
            Add
          </Button>
        </div>
        {error ? (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No to-dos yet.</p>
      ) : (
        <>
          {open.length > 0 ? (
            <ul className="grid gap-1" aria-label="Open to-dos">
              {open.map((todo) => (
                <TodoRow key={todo.id} todo={todo} onToggle={toggle} onDelete={remove} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Everything is done.</p>
          )}
          {done.length > 0 ? (
            <details className="group rounded-md border">
              <summary className="flex min-h-tap cursor-pointer items-center px-3 text-sm font-medium">
                Done ({done.length})
              </summary>
              <ul className="grid gap-1 border-t px-1 py-1" aria-label="Done to-dos">
                {done.map((todo) => (
                  <TodoRow key={todo.id} todo={todo} onToggle={toggle} onDelete={remove} />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
}: {
  todo: AdminTodo;
  onToggle(todo: AdminTodo, checked: boolean): void;
  onDelete(todo: AdminTodo): void;
}) {
  const id = useId();
  const isDone = todo.doneAt !== null;
  const pending = todo.id.startsWith('pending-');
  return (
    <li className="flex min-h-tap items-center gap-3 rounded-md px-2 hover:bg-accent/50">
      <Checkbox
        id={id}
        checked={isDone}
        disabled={pending}
        onCheckedChange={(v) => onToggle(todo, v === true)}
        className="size-5"
      />
      <label
        htmlFor={id}
        className={`min-w-0 flex-1 py-2 text-sm break-words ${isDone ? 'text-muted-foreground line-through' : ''}`}
      >
        {todo.title}
        {todo.notes ? (
          <span className="block text-xs text-muted-foreground no-underline">{todo.notes}</span>
        ) : null}
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-tap shrink-0"
        disabled={pending}
        onClick={() => onDelete(todo)}
        aria-label={`Delete “${todo.title}”`}
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  );
}
