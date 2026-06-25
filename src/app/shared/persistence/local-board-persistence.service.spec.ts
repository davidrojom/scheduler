import { TestBed } from '@angular/core/testing';

import { LocalBoardPersistence } from './local-board-persistence.service';

describe('LocalBoardPersistence', () => {
  let persistence: LocalBoardPersistence;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    persistence = TestBed.inject(LocalBoardPersistence);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('creates a default project on first load when storage is empty', () => {
    const projects = persistence.loadProjects();

    expect(projects.length).toBe(1);
    expect(projects[0].name).toBe('Default Project');
    expect(persistence.getCurrentProject()?.id).toBe(projects[0].id);
    expect(localStorage.getItem('scheduler_current_project_id')).toBe(
      projects[0].id
    );
  });

  it('persists columns under the current project namespace', () => {
    const current = persistence.getCurrentProject()!;

    persistence.setColumns([{ id: 'c1', title: 'Main Stage' }]);

    expect(localStorage.getItem(`${current.id}_columns`)).toContain(
      'Main Stage'
    );
    expect(persistence.getConfig().columns).toEqual([
      { id: 'c1', title: 'Main Stage' },
    ]);
  });

  it('stores task time as non-zero-padded H:M and fabricates Date on read', () => {
    const current = persistence.getCurrentProject()!;
    const start = new Date();
    start.setHours(9, 5, 0, 0);
    const end = new Date();
    end.setHours(10, 0, 0, 0);

    persistence.setTasks([
      {
        id: 't1',
        columnId: 'c1',
        title: 'Talk',
        start,
        end,
        participants: ['Alice'],
      },
    ]);

    const raw = localStorage.getItem(`${current.id}_tasks`)!;
    expect(raw).toContain('"startHour":"9:5"');
    expect(raw).toContain('"endHour":"10:0"');

    const task = persistence.getConfig().tasks[0];
    expect(task.start.getHours()).toBe(9);
    expect(task.start.getMinutes()).toBe(5);
    expect(task.end.getHours()).toBe(10);
    expect(task.end.getMinutes()).toBe(0);
  });

  it('isolates content per project across reactive switches (no reload)', () => {
    const first = persistence.getCurrentProject()!;
    persistence.setColumns([{ id: 'a', title: 'A-col' }]);

    const second = persistence.createProject('Second');
    persistence.switchProject(second.id).subscribe();

    expect(persistence.getCurrentProject()?.id).toBe(second.id);
    expect(persistence.getConfig().columns).toEqual([]);

    persistence.setColumns([{ id: 'b', title: 'B-col' }]);
    expect(persistence.getConfig().columns).toEqual([
      { id: 'b', title: 'B-col' },
    ]);

    persistence.switchProject(first.id).subscribe();
    expect(persistence.getConfig().columns).toEqual([
      { id: 'a', title: 'A-col' },
    ]);
  });

  it('removes a deleted project and its namespaced content keys', () => {
    const second = persistence.createProject('Second');
    persistence.switchProject(second.id).subscribe();
    persistence.setColumns([{ id: 'b', title: 'B-col' }]);

    persistence.deleteProject(second.id);

    expect(localStorage.getItem(`${second.id}_columns`)).toBeNull();
    expect(persistence.getProjects().some((p) => p.id === second.id)).toBeFalse();
  });
});
