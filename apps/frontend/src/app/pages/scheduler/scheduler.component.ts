import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  TemplateRef,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe } from '@angular/common';
import { ScheduleComponent } from './components/schedule/schedule.component';
import {
  FormArray,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { v4 } from 'uuid';
import { Observable, distinctUntilChanged, map } from 'rxjs';
import { ColumnsService } from '../../shared/services/columns.service';
import { ProjectService } from '../../shared/services/project.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TasksService } from '../../shared/services/tasks.service';
import { ParticipantsService } from '../../shared/services/participants.service';
import { ExportService } from '../../shared/services/export.service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfigService } from '../../shared/services/config.service';
import { MobileDetectionService } from '../../shared/services/mobile-detection.service';
import { ParticipantStatsModalComponent } from './components/modals/participant-stats/participant-stats-modal.component';
import { SettingsComponent } from './components/modals/settings/settings.component';
import { ProjectSwitcherComponent } from './components/project-switcher/project-switcher.component';
import { ShareInviteComponent } from './components/share-invite/share-invite.component';
import { CollaboratorsComponent } from './components/collaborators/collaborators.component';
import { AuthMenuComponent } from '../../shared/ui/components/auth-menu/auth-menu.component';
import { PresenceIndicatorComponent } from './components/presence-indicator/presence-indicator.component';
import { CursorOverlayComponent } from './components/cursor-overlay/cursor-overlay.component';
import { HlmButtonDirective, HlmInputDirective } from '../../shared/ui/spartan';
import { DragAndDropModule } from 'angular-draggable-droppable';

@Component({
  selector: 'sch-scheduler',
  templateUrl: 'scheduler.component.html',
  styleUrl: 'scheduler.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CdkDropList,
    CdkDrag,
    ScrollingModule,
    AsyncPipe,
    ScheduleComponent,
    FormsModule,
    ReactiveFormsModule,
    ProjectSwitcherComponent,
    ShareInviteComponent,
    CollaboratorsComponent,
    AuthMenuComponent,
    PresenceIndicatorComponent,
    CursorOverlayComponent,
    HlmButtonDirective,
    HlmInputDirective,
    DragAndDropModule,
  ],
})
export class SchedulerComponent implements OnInit {
  form = new FormGroup({
    columns: new FormArray<
      FormGroup<{
        id: FormControl<string>;
        title: FormControl<string>;
      }>
    >([]),
  });

  @ViewChild('dropList', {
    static: true,
  })
  dropList!: CdkDropList;

  exportHash = '';
  mobileMenuOpen = false;
  canEdit$!: Observable<boolean>;
  currentBoardId$!: Observable<string | null>;

  get isMobile(): boolean {
    return this.mobileDetectionService.isMobile;
  }

  constructor(
    private readonly columnsService: ColumnsService,
    private readonly tasksService: TasksService,
    private readonly participantsService: ParticipantsService,
    private readonly configService: ConfigService,
    private readonly exportService: ExportService,
    private readonly destroyRef: DestroyRef,
    private readonly modal: NgbModal,
    private readonly mobileDetectionService: MobileDetectionService,
    private readonly projectService: ProjectService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}
  ngOnInit(): void {
    this.canEdit$ = this.projectService.canEditCurrentBoard$;
    this.currentBoardId$ = this.projectService.currentProject$.pipe(
      map((project) => project?.id ?? null),
      distinctUntilChanged()
    );

    this.columnsService.columns$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((columns) => {
        this.setColumns(columns);
      });

    this.projectService.currentProject$
      .pipe(
        map((project) => project?.id ?? null),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.reloadBoard();
      });

    // Remote collaborator ops / reconnect re-sync replace the active board's
    // content in the persistence layer; re-read only the affected streams so
    // live edits appear without a reload (and without disrupting unaffected
    // in-progress editing).
    this.projectService.boardContentSync$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((scopes) => {
        if (scopes.includes('columns')) {
          this.columnsService.setColumns();
        }
        if (scopes.includes('tasks')) {
          this.tasksService.setTasks();
        }
        if (scopes.includes('participants')) {
          this.participantsService.setParticipants();
        }
        // A remote op has no originating DOM event, so this OnPush component
        // must be marked dirty explicitly for the rehydrated state to paint.
        this.changeDetector.markForCheck();
      });

    this.form.controls.columns.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((columns) => {
        this.columnsService.updateColumnOrder(
          columns.map((column) => ({
            id: column.id as string,
            title: column.title as string,
          }))
        );
      });
  }

  drop(event: CdkDragDrop<string[]>) {
    if (!this.projectService.isCurrentBoardEditable) {
      return;
    }

    window.umami?.track('column-reorder');

    moveItemInArray(
      this.form.controls.columns.controls,
      event.previousIndex,
      event.currentIndex
    );

    this.saveOrder();
  }

  addColumn() {
    if (!this.projectService.isCurrentBoardEditable) {
      return;
    }

    this.form.controls.columns.push(
      new FormGroup({
        id: new FormControl<string>(v4(), {
          nonNullable: true,
        }),
        title: new FormControl<string>(
          `New Column ${this.form.controls.columns.length + 1}`,
          {
            nonNullable: true,
            validators: [Validators.required],
          }
        ),
      })
    );

    this.saveOrder();
  }

  removeColumn(columnId: string) {
    if (!this.projectService.isCurrentBoardEditable) {
      return;
    }

    const index = this.form.controls.columns.controls.findIndex(
      (control) => control.controls.id.value === columnId
    );

    if (index === -1) {
      return;
    }

    this.form.controls.columns.removeAt(index);

    this.tasksService.removeTasksByColumnId(columnId);

    this.saveOrder();
  }

  setColumns(
    columns: {
      id: string;
      title: string;
    }[]
  ) {
    this.form.controls.columns.clear();

    for (const column of columns) {
      this.form.controls.columns.push(
        new FormGroup({
          id: new FormControl<string>(column.id, {
            nonNullable: true,
          }),
          title: new FormControl<string>(column.title, {
            nonNullable: true,
            validators: [Validators.required],
          }),
        })
      );
    }
  }

  private saveOrder() {
    const columns = this.form.controls.columns.controls.map((control) => {
      return {
        id: control.controls.id.value,
        title: control.controls.title.value,
      };
    });

    this.columnsService.updateColumnOrder(columns);
  }

  wipeData() {
    if (!this.projectService.isCurrentBoardEditable) {
      return;
    }

    this.columnsService.wipeColumns();
    this.tasksService.wipeTasks();
    this.participantsService.wipeParticipants();
  }

  async exportAndDownload() {
    try {
      const columns = this.columnsService.columns;
      const tasks = this.tasksService.tasks;
      const participants = this.participantsService.participants;

      await this.exportService.exportParticipantSchedules({
        columns,
        tasks,
        participants,
      });
    } catch (error) {
      console.error('Error exporting participant schedules:', error);
      alert('Error exporting schedules. Check console for details.');
    }
  }

  open(content: TemplateRef<unknown>) {
    this.modal.open(content, { ariaLabelledBy: 'confirmation' });
  }

  columnDragStarted(columnContainer: HTMLDivElement) {
    columnContainer.classList.add('dragging');
  }

  columnDragEnded(columnContainer: HTMLDivElement) {
    columnContainer.classList.remove('dragging');
  }

  import(hash: string) {
    if (!this.projectService.isCurrentBoardEditable) {
      return;
    }

    const data = JSON.parse(atob(hash));
    this.configService.setConfig(data);
    this.reloadBoard();
  }

  private reloadBoard() {
    this.columnsService.setColumns();
    this.tasksService.setTasks();
    this.participantsService.setParticipants();
  }

  updateExportHash() {
    const config = this.configService.getConfig();

    this.exportHash = btoa(JSON.stringify(config));
  }

  copyToClipboard() {
    navigator.clipboard.writeText(this.exportHash);
  }

  async takeScreenshot() {
    await this.exportService.takeScreenshotOfNodeAndDownload('#schedule');
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu() {
    this.mobileMenuOpen = false;
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.mobileMenuOpen) {
      this.closeMobileMenu();
      return;
    }

    if (event.key === 'm' || event.key === 'M') {
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      this.toggleMobileMenu();
    }
  }

  openParticipantStats() {
    this.modal.open(ParticipantStatsModalComponent, {
      size: 'lg',
      ariaLabelledBy: 'participant-stats-modal',
    });
  }

  openSettings() {
    this.modal.open(SettingsComponent, {
      size: 'lg',
      ariaLabelledBy: 'settings-modal',
    });
  }
}
