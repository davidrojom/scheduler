import { Component, input, output } from '@angular/core';

@Component({
  selector: 'sch-modal-header',
  templateUrl: './modal-header.component.html',
  styleUrl: './modal-header.component.scss',
  standalone: true,
})
export class ModalHeaderComponent {
  title = input.required<string>();

  close = output<void>();
}
