import { TestBed } from '@angular/core/testing';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { TaskModalComponent, Task } from './task-modal.component';
import { ParticipantsService } from '../../../../../shared/services/participants.service';
import { TasksService } from '../../../../../shared/services/tasks.service';

function editTask(): Task {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date();
  end.setHours(10, 0, 0, 0);
  return {
    id: 't1',
    columnId: 'c1',
    title: 'Task',
    start,
    end,
    participants: [],
  };
}

describe('TaskModalComponent role gating', () => {
  let activeModal: { close: jasmine.Spy };

  function createComponent(): TaskModalComponent {
    activeModal = { close: jasmine.createSpy('close') };

    TestBed.configureTestingModule({
      imports: [TaskModalComponent],
      providers: [
        { provide: NgbActiveModal, useValue: activeModal },
        { provide: ParticipantsService, useValue: { participants: [], createIfNotExists: () => undefined } },
        { provide: TasksService, useValue: { tasks: [] } },
      ],
    });

    const fixture = TestBed.createComponent(TaskModalComponent);
    const component = fixture.componentInstance;
    // Avoid resolving the static ViewChild (and rendering flatpickr/ng-select);
    // ngOnInit only focuses this element in the editable path.
    (component as unknown as { columnTitle: { nativeElement: { focus: () => void } } }).columnTitle =
      { nativeElement: { focus: () => undefined } };
    return component;
  }

  it('disables the form and flags read-only for a viewer edit', () => {
    const component = createComponent();
    component.modalData = {
      type: 'edit',
      readOnly: true,
      task: editTask(),
      saveHandler: () => undefined,
      deleteHandler: () => undefined,
    };

    component.ngOnInit();

    expect(component.readOnly).toBeTrue();
    expect(component.form.disabled).toBeTrue();
  });

  it('does not invoke save/delete handlers while read-only', () => {
    const component = createComponent();
    const saveHandler = jasmine.createSpy('saveHandler');
    const deleteHandler = jasmine.createSpy('deleteHandler');
    component.modalData = {
      type: 'edit',
      readOnly: true,
      task: editTask(),
      saveHandler,
      deleteHandler,
    };

    component.ngOnInit();
    component.save();
    component.deleteTask('t1');

    expect(saveHandler).not.toHaveBeenCalled();
    expect(deleteHandler).not.toHaveBeenCalled();
  });

  it('keeps the form editable and invokes save for an editor/owner', () => {
    const component = createComponent();
    const saveHandler = jasmine.createSpy('saveHandler');
    const deleteHandler = jasmine.createSpy('deleteHandler');
    component.modalData = {
      type: 'edit',
      task: editTask(),
      saveHandler,
      deleteHandler,
    };

    component.ngOnInit();

    expect(component.readOnly).toBeFalse();
    expect(component.form.enabled).toBeTrue();

    component.save();
    expect(saveHandler).toHaveBeenCalledTimes(1);
  });
});
