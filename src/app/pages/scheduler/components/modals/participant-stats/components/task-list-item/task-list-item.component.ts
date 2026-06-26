import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormatTimePipe } from '../../../../../../../shared/pipes/format-time.pipe';

export interface Task {
  id: string;
  columnId: string;
  title: string;
  start: Date;
  end: Date;
  columnTitle: string;
  durationMinutes: number;
}

@Component({
  selector: 'sch-task-list-item',
  standalone: true,
  imports: [FormatTimePipe],
  templateUrl: './task-list-item.component.html',
  styleUrl: './task-list-item.component.scss'
})
export class TaskListItemComponent {
  @Input({ required: true }) task!: Task;
  @Input() readOnly = false;
  @Output() remove = new EventEmitter<string>();

  formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  onRemove(): void {
    this.remove.emit(this.task.id);
  }
}
