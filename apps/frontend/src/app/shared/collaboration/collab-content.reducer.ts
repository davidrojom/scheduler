import { BoardColumn, BoardContent } from '../persistence/board-persistence';
import { RemoteEvent, RemoteTask } from './collaboration.types';
import { Task } from '../../pages/scheduler/components/modals/task/task-modal.component';

export type BoardSyncScope = 'columns' | 'tasks' | 'participants' | 'project';

export interface ContentReduction {
  content: BoardContent;
  scopes: BoardSyncScope[];
}

/**
 * Fabricates the task's `Date`s against *today* from the stored "H:M" strings,
 * matching how the REST snapshot is hydrated (architecture §10.2).
 */
export function taskFromRemote(remote: RemoteTask): Task {
  const start = new Date();
  const end = new Date();
  const [startHour, startMinute] = remote.startHour.split(':').map(Number);
  const [endHour, endMinute] = remote.endHour.split(':').map(Number);
  start.setHours(startHour, startMinute, 0, 0);
  end.setHours(endHour, endMinute, 0, 0);
  return {
    id: remote.id,
    columnId: remote.columnId,
    title: remote.title,
    start,
    end,
    participants: remote.participants ?? [],
  };
}

function hourMinute(value: Date): string {
  return `${value.getHours()}:${value.getMinutes()}`;
}

function tasksEqual(a: Task, b: Task): boolean {
  return (
    a.columnId === b.columnId &&
    a.title === b.title &&
    hourMinute(a.start) === hourMinute(b.start) &&
    hourMinute(a.end) === hourMinute(b.end) &&
    JSON.stringify(a.participants ?? []) === JSON.stringify(b.participants ?? [])
  );
}

/**
 * Applies a remote content event to the current board snapshot, returning the
 * next snapshot and the streams that must rehydrate. Returns `null` when the
 * event leaves the snapshot unchanged (e.g. the originator's own echo), so the
 * caller can skip a needless rehydrate that would disrupt in-progress edits.
 * `board:updated` is intentionally not handled here — it mutates the project
 * (name/config), not board content.
 */
export function reduceRemoteContent(
  content: BoardContent,
  event: RemoteEvent
): ContentReduction | null {
  switch (event.type) {
    case 'column:created': {
      const { id, title, position } = event.column;
      const existing = content.columns.find((c) => c.id === id);
      if (existing && existing.title === title) {
        return null;
      }
      const columns = content.columns.filter((c) => c.id !== id);
      const next: BoardColumn = { id, title };
      const index = Math.max(0, Math.min(position, columns.length));
      columns.splice(index, 0, next);
      return { content: { ...content, columns }, scopes: ['columns'] };
    }

    case 'column:updated': {
      const { id, title } = event.column;
      const existing = content.columns.find((c) => c.id === id);
      if (!existing || existing.title === title) {
        return null;
      }
      const columns = content.columns.map((c) =>
        c.id === id ? { ...c, title } : c
      );
      return { content: { ...content, columns }, scopes: ['columns'] };
    }

    case 'column:deleted': {
      if (!content.columns.some((c) => c.id === event.columnId)) {
        return null;
      }
      const columns = content.columns.filter((c) => c.id !== event.columnId);
      const tasks = content.tasks.filter((t) => t.columnId !== event.columnId);
      const scopes: BoardSyncScope[] =
        tasks.length !== content.tasks.length
          ? ['columns', 'tasks']
          : ['columns'];
      return { content: { ...content, columns, tasks }, scopes };
    }

    case 'column:reordered': {
      const orderedIds = event.columns.map((c) => c.id);
      const currentIds = content.columns.map((c) => c.id);
      if (orderedIds.join('|') === currentIds.join('|')) {
        return null;
      }
      const byId = new Map(content.columns.map((c) => [c.id, c]));
      const columns: BoardColumn[] = event.columns.map((c) => ({
        id: c.id,
        title: byId.get(c.id)?.title ?? c.title,
      }));
      return { content: { ...content, columns }, scopes: ['columns'] };
    }

    case 'task:created':
    case 'task:updated': {
      const next = taskFromRemote(event.task);
      const existing = content.tasks.find((t) => t.id === next.id);
      if (existing && tasksEqual(existing, next)) {
        return null;
      }
      const tasks = existing
        ? content.tasks.map((t) => (t.id === next.id ? next : t))
        : [...content.tasks, next];
      return { content: { ...content, tasks }, scopes: ['tasks'] };
    }

    case 'task:deleted': {
      if (!content.tasks.some((t) => t.id === event.taskId)) {
        return null;
      }
      const tasks = content.tasks.filter((t) => t.id !== event.taskId);
      return { content: { ...content, tasks }, scopes: ['tasks'] };
    }

    case 'participant:added': {
      if (content.participants.includes(event.name)) {
        return null;
      }
      const participants = [...content.participants, event.name];
      return { content: { ...content, participants }, scopes: ['participants'] };
    }

    case 'participant:removed': {
      if (!content.participants.includes(event.name)) {
        return null;
      }
      const participants = content.participants.filter(
        (name) => name !== event.name
      );
      return { content: { ...content, participants }, scopes: ['participants'] };
    }

    default:
      return null;
  }
}
