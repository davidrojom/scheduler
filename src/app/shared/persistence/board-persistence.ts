import { Observable } from 'rxjs';
import { Task } from '../../pages/scheduler/components/modals/task/task-modal.component';
import { Project, ProjectConfig } from '../models/project.model';

export interface BoardColumn {
  id: string;
  title: string;
}

export interface BoardContent {
  columns: BoardColumn[];
  tasks: Task[];
  participants: string[];
  logo: string | null;
}

export interface BoardContentInput {
  columns: BoardColumn[];
  tasks: Task[];
  participants: string[];
  logo?: string | null;
}

export type ProjectUpdate = Partial<Omit<Project, 'id' | 'createdAt'>>;

/**
 * Strategy that backs every board lifecycle and content operation. Two
 * implementations exist: localStorage (anonymous) and REST (authenticated).
 * Reads return the in-memory snapshot synchronously so the existing state
 * services keep their public API; switchProject is async because the REST
 * strategy must fetch the board before the view rehydrates.
 */
export interface BoardPersistence {
  loadProjects(): Project[];
  getProjects(): Project[];
  getCurrentProject(): Project | null;
  getProjectConfig(projectId?: string): ProjectConfig;
  createProject(name: string, config?: Partial<ProjectConfig>): Project;
  updateProject(id: string, updates: ProjectUpdate): Project | null;
  deleteProject(id: string): void;
  switchProject(id: string): Observable<void>;

  getConfig(): BoardContent;
  setColumns(columns: BoardColumn[]): void;
  setTasks(tasks: Task[]): void;
  setParticipants(participants: string[]): void;
  setConfig(config: BoardContentInput): void;
}
