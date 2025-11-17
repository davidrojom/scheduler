import {
  ChangeDetectionStrategy,
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
import { JsonPipe } from '@angular/common';
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
import { ColumnsService } from '../../shared/services/columns.service';
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
    ScheduleComponent,
    FormsModule,
    ReactiveFormsModule,
    ProjectSwitcherComponent,
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
    private readonly mobileDetectionService: MobileDetectionService
  ) {}
  ngOnInit(): void {
    this.columnsService.columns$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((columns) => {
        this.setColumns(columns);
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
    (window as any).umami?.track('column-reorder');

    moveItemInArray(
      this.form.controls.columns.controls,
      event.previousIndex,
      event.currentIndex
    );

    this.saveOrder();
  }

  addColumn() {
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

  open(content: TemplateRef<any>) {
    this.modal.open(content, { ariaLabelledBy: 'confirmation' });
  }

  columnDragStarted(columnContainer: HTMLDivElement) {
    columnContainer.classList.add('dragging');
  }

  columnDragEnded(columnContainer: HTMLDivElement) {
    columnContainer.classList.remove('dragging');
  }

  import(hash: string) {
    const data = JSON.parse(atob(hash));
    this.configService.setConfig(data);
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
