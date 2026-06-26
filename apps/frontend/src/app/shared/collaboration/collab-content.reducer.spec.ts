import { reduceRemoteContent, taskFromRemote } from './collab-content.reducer';
import { BoardContent } from '../persistence/board-persistence';
import { RemoteColumn, RemoteTask } from './collaboration.types';
import { Task } from '../../pages/scheduler/components/modals/task/task-modal.component';

function emptyContent(): BoardContent {
  return { columns: [], tasks: [], participants: [], logo: null };
}

function remoteColumn(id: string, title: string, position: number): RemoteColumn {
  return { id, title, position };
}

function remoteTask(
  id: string,
  columnId: string,
  title: string,
  startHour: string,
  endHour: string,
  participants: string[] = [],
  position = 0
): RemoteTask {
  return { id, columnId, title, startHour, endHour, participants, position };
}

function localTask(t: RemoteTask): Task {
  return taskFromRemote(t);
}

describe('reduceRemoteContent', () => {
  describe('columns', () => {
    it('inserts a created column at its position and reports the columns scope', () => {
      const content: BoardContent = {
        ...emptyContent(),
        columns: [{ id: 'c1', title: 'A' }],
      };

      const result = reduceRemoteContent(content, {
        type: 'column:created',
        boardId: 'b1',
        column: remoteColumn('c2', 'B', 1),
      });

      expect(result).not.toBeNull();
      expect(result!.scopes).toContain('columns');
      expect(result!.content.columns).toEqual([
        { id: 'c1', title: 'A' },
        { id: 'c2', title: 'B' },
      ]);
    });

    it('skips a created column that already exists with the same title (own echo)', () => {
      const content: BoardContent = {
        ...emptyContent(),
        columns: [{ id: 'c1', title: 'A' }],
      };

      const result = reduceRemoteContent(content, {
        type: 'column:created',
        boardId: 'b1',
        column: remoteColumn('c1', 'A', 0),
      });

      expect(result).toBeNull();
    });

    it('renames a column on column:updated', () => {
      const content: BoardContent = {
        ...emptyContent(),
        columns: [{ id: 'c1', title: 'A' }],
      };

      const result = reduceRemoteContent(content, {
        type: 'column:updated',
        boardId: 'b1',
        column: remoteColumn('c1', 'Main Stage', 0),
      });

      expect(result!.content.columns).toEqual([{ id: 'c1', title: 'Main Stage' }]);
      expect(result!.scopes).toContain('columns');
    });

    it('skips column:updated when the title is unchanged (own echo)', () => {
      const content: BoardContent = {
        ...emptyContent(),
        columns: [{ id: 'c1', title: 'A' }],
      };

      const result = reduceRemoteContent(content, {
        type: 'column:updated',
        boardId: 'b1',
        column: remoteColumn('c1', 'A', 0),
      });

      expect(result).toBeNull();
    });

    it('removes a deleted column and cascades its tasks', () => {
      const content: BoardContent = {
        ...emptyContent(),
        columns: [
          { id: 'c1', title: 'A' },
          { id: 'c2', title: 'B' },
        ],
        tasks: [
          localTask(remoteTask('t1', 'c1', 'X', '9:0', '10:0')),
          localTask(remoteTask('t2', 'c2', 'Y', '9:0', '10:0')),
        ],
      };

      const result = reduceRemoteContent(content, {
        type: 'column:deleted',
        boardId: 'b1',
        columnId: 'c1',
      });

      expect(result!.content.columns).toEqual([{ id: 'c2', title: 'B' }]);
      expect(result!.content.tasks.map((t) => t.id)).toEqual(['t2']);
      expect(result!.scopes).toEqual(jasmine.arrayContaining(['columns', 'tasks']));
    });

    it('reorders columns to the broadcast order', () => {
      const content: BoardContent = {
        ...emptyContent(),
        columns: [
          { id: 'c1', title: 'A' },
          { id: 'c2', title: 'B' },
          { id: 'c3', title: 'C' },
        ],
      };

      const result = reduceRemoteContent(content, {
        type: 'column:reordered',
        boardId: 'b1',
        columns: [
          remoteColumn('c3', 'C', 0),
          remoteColumn('c1', 'A', 1),
          remoteColumn('c2', 'B', 2),
        ],
      });

      expect(result!.content.columns.map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
      expect(result!.scopes).toContain('columns');
    });

    it('skips column:reordered when the order already matches (own echo)', () => {
      const content: BoardContent = {
        ...emptyContent(),
        columns: [
          { id: 'c1', title: 'A' },
          { id: 'c2', title: 'B' },
        ],
      };

      const result = reduceRemoteContent(content, {
        type: 'column:reordered',
        boardId: 'b1',
        columns: [remoteColumn('c1', 'A', 0), remoteColumn('c2', 'B', 1)],
      });

      expect(result).toBeNull();
    });
  });

  describe('tasks', () => {
    it('inserts a created task converting "H:M" into Date', () => {
      const content = emptyContent();

      const result = reduceRemoteContent(content, {
        type: 'task:created',
        boardId: 'b1',
        task: remoteTask('t1', 'c1', 'Show', '9:5', '10:30', ['Ana']),
      });

      expect(result!.content.tasks.length).toBe(1);
      const task = result!.content.tasks[0];
      expect(task.id).toBe('t1');
      expect(task.start.getHours()).toBe(9);
      expect(task.start.getMinutes()).toBe(5);
      expect(task.end.getHours()).toBe(10);
      expect(task.end.getMinutes()).toBe(30);
      expect(task.participants).toEqual(['Ana']);
      expect(result!.scopes).toEqual(['tasks']);
    });

    it('replaces an existing task on task:updated (last-write-wins)', () => {
      const content: BoardContent = {
        ...emptyContent(),
        tasks: [localTask(remoteTask('t1', 'c1', 'Old', '9:0', '10:0'))],
      };

      const result = reduceRemoteContent(content, {
        type: 'task:updated',
        boardId: 'b1',
        task: remoteTask('t1', 'c1', 'New', '11:0', '12:0', ['Bob']),
      });

      expect(result!.content.tasks.length).toBe(1);
      expect(result!.content.tasks[0].title).toBe('New');
      expect(result!.content.tasks[0].start.getHours()).toBe(11);
      expect(result!.content.tasks[0].participants).toEqual(['Bob']);
    });

    it('skips a task echo that matches the current task', () => {
      const existing = remoteTask('t1', 'c1', 'Show', '9:0', '10:0', ['Ana']);
      const content: BoardContent = {
        ...emptyContent(),
        tasks: [localTask(existing)],
      };

      const result = reduceRemoteContent(content, {
        type: 'task:updated',
        boardId: 'b1',
        task: existing,
      });

      expect(result).toBeNull();
    });

    it('removes a deleted task and skips when already absent', () => {
      const content: BoardContent = {
        ...emptyContent(),
        tasks: [localTask(remoteTask('t1', 'c1', 'Show', '9:0', '10:0'))],
      };

      const removed = reduceRemoteContent(content, {
        type: 'task:deleted',
        boardId: 'b1',
        taskId: 't1',
      });
      expect(removed!.content.tasks).toEqual([]);

      const noop = reduceRemoteContent(removed!.content, {
        type: 'task:deleted',
        boardId: 'b1',
        taskId: 't1',
      });
      expect(noop).toBeNull();
    });

    it('does not duplicate a created task that already exists (idempotent upsert)', () => {
      const existing = remoteTask('t1', 'c1', 'Show', '9:0', '10:0');
      const content: BoardContent = {
        ...emptyContent(),
        tasks: [localTask(existing)],
      };

      const result = reduceRemoteContent(content, {
        type: 'task:created',
        boardId: 'b1',
        task: existing,
      });

      expect(result).toBeNull();
    });
  });

  describe('participants', () => {
    it('adds a participant and skips duplicates', () => {
      const content: BoardContent = {
        ...emptyContent(),
        participants: ['Ana'],
      };

      const added = reduceRemoteContent(content, {
        type: 'participant:added',
        boardId: 'b1',
        name: 'Bob',
      });
      expect(added!.content.participants).toEqual(['Ana', 'Bob']);
      expect(added!.scopes).toEqual(['participants']);

      const dup = reduceRemoteContent(added!.content, {
        type: 'participant:added',
        boardId: 'b1',
        name: 'Bob',
      });
      expect(dup).toBeNull();
    });

    it('removes a participant and skips when absent', () => {
      const content: BoardContent = {
        ...emptyContent(),
        participants: ['Ana', 'Bob'],
      };

      const removed = reduceRemoteContent(content, {
        type: 'participant:removed',
        boardId: 'b1',
        name: 'Bob',
      });
      expect(removed!.content.participants).toEqual(['Ana']);

      const noop = reduceRemoteContent(removed!.content, {
        type: 'participant:removed',
        boardId: 'b1',
        name: 'Bob',
      });
      expect(noop).toBeNull();
    });
  });

  it('returns null for board:updated (handled outside the content reducer)', () => {
    const result = reduceRemoteContent(emptyContent(), {
      type: 'board:updated',
      boardId: 'b1',
      board: {
        id: 'b1',
        name: 'Renamed',
        ownerId: 'u1',
        config: {},
        createdAt: '',
        updatedAt: '',
      },
    });
    expect(result).toBeNull();
  });
});
