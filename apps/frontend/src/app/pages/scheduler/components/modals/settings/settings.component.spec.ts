import { TestBed } from '@angular/core/testing';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable, throwError } from 'rxjs';

import { SettingsComponent } from './settings.component';
import { ProjectService } from '../../../../../shared/services/project.service';
import { Project } from '../../../../../shared/models/project.model';
import { ProjectUpdate } from '../../../../../shared/persistence/board-persistence';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'board-1',
    name: 'My Board',
    config: { dayStartHour: 6, dayEndHour: 21, segmentsByHour: 6 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('SettingsComponent', () => {
  let activeModal: jasmine.SpyObj<NgbActiveModal>;
  let updateProject: jasmine.Spy<
    (id: string, updates: ProjectUpdate) => Observable<void>
  >;
  let currentProject: Project | null;

  function setup(project: Project | null, result$: Observable<void>) {
    currentProject = project;
    updateProject = jasmine.createSpy('updateProject').and.returnValue(result$);
    activeModal = jasmine.createSpyObj('NgbActiveModal', ['close', 'dismiss']);

    const projectStub: Partial<ProjectService> = {
      get currentProject() {
        return currentProject;
      },
      updateProject: updateProject as ProjectService['updateProject'],
    };

    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: ProjectService, useValue: projectStub },
        { provide: NgbActiveModal, useValue: activeModal },
      ],
    });

    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('builds the form from the active board config', () => {
    const fixture = setup(makeProject(), neverEmits());
    const value = fixture.componentInstance.settingsForm.value;
    expect(value.name).toBe('My Board');
    expect(value.dayStartHour).toBe(6);
    expect(value.dayEndHour).toBe(21);
    expect(value.segmentsByHour).toBe(6);
  });

  it('saves via updateProject and closes the modal reactively (no page reload)', () => {
    const fixture = setup(makeProject(), syncVoid());
    const component = fixture.componentInstance;

    component.settingsForm.setValue({
      name: 'Renamed Board',
      dayStartHour: 8,
      dayEndHour: 18,
      segmentsByHour: 4,
    });

    component.save();

    expect(updateProject).toHaveBeenCalledTimes(1);
    const [id, updates] = updateProject.calls.mostRecent().args as [
      string,
      ProjectUpdate
    ];
    expect(id).toBe('board-1');
    expect(updates.name).toBe('Renamed Board');
    expect(updates.config).toEqual(
      jasmine.objectContaining({
        dayStartHour: 8,
        dayEndHour: 18,
        segmentsByHour: 4,
      })
    );
    expect(activeModal.close).toHaveBeenCalledTimes(1);
  });

  it('closes the modal even when the persistence call errors (no reload)', () => {
    const fixture = setup(makeProject(), throwError(() => new Error('boom')));
    const component = fixture.componentInstance;

    component.settingsForm.setValue({
      name: 'Still Saves',
      dayStartHour: 7,
      dayEndHour: 20,
      segmentsByHour: 6,
    });

    component.save();

    expect(activeModal.close).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for view-only (viewer) boards', () => {
    const fixture = setup(makeProject({ myRole: 'viewer' }), neverEmits());
    const component = fixture.componentInstance;

    expect(component.readOnly).toBeTrue();

    component.save();

    expect(updateProject).not.toHaveBeenCalled();
    expect(activeModal.close).not.toHaveBeenCalled();
  });

  it('does not save an invalid hour range', () => {
    const fixture = setup(makeProject(), neverEmits());
    const component = fixture.componentInstance;
    spyOn(window, 'alert');

    component.settingsForm.setValue({
      name: 'Bad Range',
      dayStartHour: 18,
      dayEndHour: 8,
      segmentsByHour: 6,
    });

    component.save();

    expect(window.alert).toHaveBeenCalled();
    expect(updateProject).not.toHaveBeenCalled();
    expect(activeModal.close).not.toHaveBeenCalled();
  });
});

function neverEmits(): Observable<void> {
  return new Observable<void>(() => undefined);
}

function syncVoid(): Observable<void> {
  return new Observable<void>((subscriber) => {
    subscriber.next();
    subscriber.complete();
  });
}
