import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  ParticipantItemComponent,
  ParticipantStats,
} from './participant-item.component';

function makeFixture(
  readOnly: boolean
): ComponentFixture<ParticipantItemComponent> {
  TestBed.configureTestingModule({
    imports: [ParticipantItemComponent],
  });

  const fixture = TestBed.createComponent(ParticipantItemComponent);
  const participant: ParticipantStats = {
    name: 'Alice',
    totalMinutes: 30,
    tasks: [
      {
        id: 't1',
        columnId: 'c1',
        title: 'Task',
        start: new Date(),
        end: new Date(),
        columnTitle: 'Room',
        durationMinutes: 30,
      },
    ],
    isExpanded: true,
  };

  fixture.componentInstance.participant = participant;
  fixture.componentInstance.readOnly = readOnly;
  fixture.detectChanges();
  return fixture;
}

describe('ParticipantItemComponent role gating', () => {
  it('shows the Delete and per-task Remove controls when editable', () => {
    const fixture = makeFixture(false);
    const el = fixture.nativeElement as HTMLElement;

    expect(
      el.querySelector('[data-umami-event="delete-participant"]')
    ).not.toBeNull();
    expect(
      el.querySelector('[data-umami-event="remove-participant-from-task"]')
    ).not.toBeNull();
  });

  it('hides the Delete and per-task Remove controls for a read-only viewer', () => {
    const fixture = makeFixture(true);
    const el = fixture.nativeElement as HTMLElement;

    expect(
      el.querySelector('[data-umami-event="delete-participant"]')
    ).toBeNull();
    expect(
      el.querySelector('[data-umami-event="remove-participant-from-task"]')
    ).toBeNull();
  });
});
