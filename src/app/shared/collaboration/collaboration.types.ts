import { ProjectConfig } from '../models/project.model';

export interface RemoteColumn {
  id: string;
  title: string;
  position: number;
}

export interface RemoteTask {
  id: string;
  columnId: string;
  title: string;
  startHour: string;
  endHour: string;
  participants: string[];
  position: number;
}

export interface RemoteBoard {
  id: string;
  name: string;
  ownerId: string;
  config: Partial<ProjectConfig>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Past-tense events broadcast by the gateway (architecture §5.3). Each carries
 * the authoritative entity so a receiver can fully replace its local copy
 * (last-write-wins). The originator also receives its own echo and reconciles
 * its optimistic state against the payload.
 */
export type RemoteEvent =
  | { type: 'column:created'; boardId: string; column: RemoteColumn }
  | { type: 'column:updated'; boardId: string; column: RemoteColumn }
  | { type: 'column:deleted'; boardId: string; columnId: string }
  | { type: 'column:reordered'; boardId: string; columns: RemoteColumn[] }
  | { type: 'task:created'; boardId: string; task: RemoteTask }
  | { type: 'task:updated'; boardId: string; task: RemoteTask }
  | { type: 'task:deleted'; boardId: string; taskId: string }
  | { type: 'participant:added'; boardId: string; name: string }
  | { type: 'participant:removed'; boardId: string; name: string }
  | { type: 'board:updated'; boardId: string; board: RemoteBoard };

export const REMOTE_EVENT_NAMES: RemoteEvent['type'][] = [
  'column:created',
  'column:updated',
  'column:deleted',
  'column:reordered',
  'task:created',
  'task:updated',
  'task:deleted',
  'participant:added',
  'participant:removed',
  'board:updated',
];
