import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { PresenceIndicatorComponent } from './presence-indicator.component';
import { CollaborationService } from '../../../../shared/collaboration/collaboration.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { PresenceMember } from '../../../../shared/collaboration/collaboration.types';

describe('PresenceIndicatorComponent', () => {
  let fixture: ComponentFixture<PresenceIndicatorComponent>;
  let presence$: BehaviorSubject<PresenceMember[]>;
  let followedUserId: ReturnType<typeof signal<string | null>>;
  let toggleFollow: jasmine.Spy;

  function member(userId: string, name: string): PresenceMember {
    return { userId, name, color: '#f00' };
  }

  beforeEach(() => {
    presence$ = new BehaviorSubject<PresenceMember[]>([
      member('u1', 'Alice'),
      member('u2', 'Bob'),
    ]);
    followedUserId = signal<string | null>(null);
    toggleFollow = jasmine.createSpy('toggleFollow');
    const collabStub: Partial<CollaborationService> = {
      presence$: presence$.asObservable(),
      followedUserId,
      toggleFollow:
        toggleFollow as unknown as CollaborationService['toggleFollow'],
    };
    const authStub: Partial<AuthService> = {
      currentUser: { id: 'u1', email: 'a@b.c', name: 'Alice', avatarUrl: null },
    };

    TestBed.configureTestingModule({
      imports: [PresenceIndicatorComponent],
      providers: [
        { provide: CollaborationService, useValue: collabStub },
        { provide: AuthService, useValue: authStub },
      ],
    });

    fixture = TestBed.createComponent(PresenceIndicatorComponent);
    fixture.detectChanges();
  });

  function avatarButtons(): HTMLButtonElement[] {
    const host = fixture.nativeElement as HTMLElement;
    return Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        '[data-testid="presence-indicator"] button'
      )
    );
  }

  it('renders one follow button per present member', () => {
    const buttons = avatarButtons();
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent?.trim()).toBe('A');
    expect(buttons[1].textContent?.trim()).toBe('B');
  });

  it('clicking an avatar toggles follow for that member', () => {
    avatarButtons()[1].click();
    expect(toggleFollow).toHaveBeenCalledWith('u2');
  });

  it('marks the followed member avatar as pressed', () => {
    followedUserId.set('u2');
    fixture.detectChanges();

    const buttons = avatarButtons();
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('does not offer follow on your own avatar', () => {
    const buttons = avatarButtons();
    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[1].disabled).toBeFalse();
  });
});
