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

export interface MigrationTask {
  id: string;
  columnId: string;
  title: string;
  startHour: string;
  endHour: string;
  participants: string[];
}

/**
 * A local board plus its content shaped for POST /api/boards/import. Times stay
 * as the stored non-zero-padded "H:M" strings so the backend persists them
 * verbatim; ids are the original client uuids so the import is idempotent.
 */
export interface MigrationBoardEntry {
  board: { id: string; name: string; config: ProjectConfig };
  columns: BoardColumn[];
  tasks: MigrationTask[];
  participants: string[];
}

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
  /**
   * (Re)loads the authoritative board list for the active strategy. Local
   * returns the in-memory localStorage projects synchronously; Api fetches
   * GET /api/boards. Used to (re)populate the switcher when auth state changes.
   */
  refreshBoards(): Observable<Project[]>;
  createProject(name: string, config?: Partial<ProjectConfig>): Project;
  updateProject(id: string, updates: ProjectUpdate): Observable<Project | null>;
  deleteProject(id: string): void;
  switchProject(id: string): Observable<void>;

  getConfig(): BoardContent;
  setColumns(columns: BoardColumn[]): void;
  setTasks(tasks: Task[]): void;
  setParticipants(participants: string[]): void;
  setConfig(config: BoardContentInput): void;
}
