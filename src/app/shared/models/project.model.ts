export type BoardRole = 'owner' | 'editor' | 'viewer';

export interface ProjectConfig {
  dayStartHour: number;
  dayEndHour: number;
  segmentsByHour: number;
  logo?: string;
}

export interface Project {
  id: string;
  name: string;
  config: ProjectConfig;
  createdAt: Date;
  updatedAt: Date;
  myRole?: BoardRole;
}

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  dayStartHour: 6,
  dayEndHour: 21,
  segmentsByHour: 6,
  logo: undefined,
};
