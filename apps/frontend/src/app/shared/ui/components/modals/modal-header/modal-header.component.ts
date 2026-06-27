import { Component, input, output } from '@angular/core';
import { HlmButtonDirective } from '../../../spartan';

@Component({
  selector: 'sch-modal-header',
  templateUrl: './modal-header.component.html',
  styleUrl: './modal-header.component.scss',
  standalone: true,
  imports: [HlmButtonDirective],
})
export class ModalHeaderComponent {
  title = input.required<string>();

  close = output<void>();
}
