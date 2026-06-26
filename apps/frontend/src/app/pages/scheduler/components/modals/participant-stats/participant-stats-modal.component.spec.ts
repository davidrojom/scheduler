import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import { ParticipantStatsModalComponent } from './participant-stats-modal.component';
import { TasksService } from '../../../../../shared/services/tasks.service';
import { ParticipantsService } from '../../../../../shared/services/participants.service';
import { ColumnsService } from '../../../../../shared/services/columns.service';
import { ProjectService } from '../../../../../shared/services/project.service';

interface StubTask {
  id: string;
  columnId: string;
  title: string;
  start: Date;
  end: Date;
  participants: string[];
}

function makeTask(id: string, participants: string[]): StubTask {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date();
  end.setHours(10, 0, 0, 0);
  return { id, columnId: 'c1', title: 'Task', start, end, participants };
}

describe('ParticipantStatsModalComponent reactive refresh', () => {
  let participants$: BehaviorSubject<{ name: string }[]>;
  let tasks$: BehaviorSubject<StubTask[]>;

  function createComponent(): ParticipantStatsModalComponent {
    participants$ = new BehaviorSubject<{ name: string }[]>([]);
    tasks$ = new BehaviorSubject<StubTask[]>([]);

    TestBed.configureTestingModule({
      imports: [ParticipantStatsModalComponent],
      providers: [
        { provide: NgbActiveModal, useValue: { dismiss: () => undefined } },
        {
          provide: TasksService,
          useValue: { tasks$, updateTask: () => undefined },
        },
        {
          provide: ParticipantsService,
          useValue: {
            participants$,
            deleteParticipant: () => undefined,
            addParticipant: () => undefined,
            hasParticipant: () => false,
          },
        },
        {
          provide: ColumnsService,
          useValue: { columns: [{ id: 'c1', title: 'Room A' }] },
        },
        { provide: ProjectService, useValue: { isCurrentBoardEditable: true } },
      ],
    });

    return TestBed.createComponent(ParticipantStatsModalComponent)
      .componentInstance;
  }

  function names(component: ParticipantStatsModalComponent): string[] {
    return component.participantStats.map((stat) => stat.name);
  }

  it('drops a removed participant live when participants$ re-emits after open', () => {
    const component = createComponent();
    participants$.next([{ name: 'Alice' }, { name: 'Bob' }]);
    component.ngOnInit();

    expect(names(component)).toEqual(
      jasmine.arrayWithExactContents(['Alice', 'Bob'])
    );

    participants$.next([{ name: 'Alice' }]);

    expect(names(component)).toEqual(['Alice']);
  });

  it('shows an added participant live when participants$ re-emits after open', () => {
    const component = createComponent();
    participants$.next([{ name: 'Alice' }]);
    component.ngOnInit();

    expect(names(component)).toEqual(['Alice']);

    participants$.next([{ name: 'Alice' }, { name: 'Bob' }]);

    expect(names(component)).toEqual(
      jasmine.arrayWithExactContents(['Alice', 'Bob'])
    );
  });

  it('recomputes totals when tasks$ re-emits after open', () => {
    const component = createComponent();
    participants$.next([{ name: 'Alice' }]);
    component.ngOnInit();

    expect(component.participantStats[0].totalMinutes).toBe(0);

    tasks$.next([makeTask('t1', ['Alice'])]);

    expect(component.participantStats[0].totalMinutes).toBe(60);
  });

  it('preserves expandedStates carry-over across reactive recomputes', () => {
    const component = createComponent();
    participants$.next([{ name: 'Alice' }, { name: 'Bob' }]);
    component.ngOnInit();

    const alice = component.participantStats.find((s) => s.name === 'Alice')!;
    component.onToggleParticipant(alice);
    expect(alice.isExpanded).toBeTrue();

    participants$.next([{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }]);

    const aliceAfter = component.participantStats.find(
      (s) => s.name === 'Alice'
    )!;
    expect(aliceAfter.isExpanded).toBeTrue();
    expect(names(component)).toContain('Carol');
  });
});
