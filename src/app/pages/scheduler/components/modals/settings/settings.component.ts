import { Component, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { ModalHeaderComponent } from '../../../../../shared/ui/components/modals/modal-header/modal-header.component';
import { ProjectService } from '../../../../../shared/services/project.service';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';

@Component({
  selector: 'sch-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ModalHeaderComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  modalTitle = 'Project Settings';
  settingsForm!: FormGroup;
  logoPreview: SafeHtml | null = null;
  logoContent: string | null = null;
  readOnly = false;

  constructor(
    public activeModal: NgbActiveModal,
    private fb: FormBuilder,
    private projectService: ProjectService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    const currentProject = this.projectService.currentProject;
    if (!currentProject) {
      this.close();
      return;
    }

    this.settingsForm = this.fb.group({
      name: [
        currentProject.name,
        [Validators.required, Validators.minLength(1)],
      ],
      dayStartHour: [
        currentProject.config.dayStartHour,
        [Validators.required, Validators.min(0), Validators.max(23)],
      ],
      dayEndHour: [
        currentProject.config.dayEndHour,
        [Validators.required, Validators.min(1), Validators.max(24)],
      ],
      segmentsByHour: [
        currentProject.config.segmentsByHour,
        [Validators.required, Validators.min(1), Validators.max(12)],
      ],
    });

    if (currentProject.config.logo) {
      this.logoContent = currentProject.config.logo;
      this.logoPreview = this.sanitizer.bypassSecurityTrustHtml(
        currentProject.config.logo
      );
    }

    if (currentProject.myRole === 'viewer') {
      this.readOnly = true;
      this.settingsForm.disable({ emitEvent: false });
    }
  }

  get minutesPerSegment(): number {
    const segments = this.settingsForm?.get('segmentsByHour')?.value || 6;
    return 60 / segments;
  }

  get hasLogo(): boolean {
    return this.logoContent !== null;
  }

  onLogoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.includes('svg')) {
      alert('Please select an SVG file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const svgContent = e.target?.result as string;
      this.logoContent = this.sanitizeSvg(svgContent);
      this.logoPreview = this.sanitizer.bypassSecurityTrustHtml(
        this.logoContent
      );
    };
    reader.readAsText(file);
  }

  removeLogo(): void {
    this.logoContent = null;
    this.logoPreview = null;
  }

  private sanitizeSvg(svgContent: string): string {
    const clean = DOMPurify.sanitize(svgContent, {
      USE_PROFILES: { svg: true, svgFilters: false },
      ADD_TAGS: [
        'svg',
        'path',
        'circle',
        'rect',
        'g',
        'line',
        'polyline',
        'polygon',
        'ellipse',
        'text',
        'tspan',
      ],
      FORBID_ATTR: ['inkscape:*', 'sodipodi:*', 'filter'],
      FORBID_TAGS: [
        'script',
        'style',
        'defs',
        'filter',
        'metadata',
        'foreignObject',
      ],
    });

    const parser = new DOMParser();
    const doc = parser.parseFromString(clean, 'image/svg+xml');
    const svgElement = doc.documentElement;

    const attrsToRemove = Array.from(svgElement.attributes)
      .filter(
        (attr) =>
          attr.name.startsWith('xmlns:') &&
          !['xmlns:svg', 'xmlns'].includes(attr.name)
      )
      .map((attr) => attr.name);

    attrsToRemove.forEach((attr) => svgElement.removeAttribute(attr));

    const allElements = svgElement.querySelectorAll('*');
    allElements.forEach((el) => {
      if (el.hasAttribute('filter')) {
        el.removeAttribute('filter');
      }
      if (el.hasAttribute('style')) {
        const style = el.getAttribute('style') || '';
        const filteredStyle = style
          .split(';')
          .filter((s) => !s.trim().startsWith('filter:'))
          .join(';');
        if (filteredStyle.trim()) {
          el.setAttribute('style', filteredStyle);
        } else {
          el.removeAttribute('style');
        }
      }
    });

    return new XMLSerializer().serializeToString(svgElement);
  }

  save(): void {
    if (this.readOnly) {
      return;
    }

    if (this.settingsForm.invalid) {
      Object.keys(this.settingsForm.controls).forEach((key) => {
        this.settingsForm.get(key)?.markAsTouched();
      });
      return;
    }

    const currentProject = this.projectService.currentProject;
    if (!currentProject) return;

    const formValue = this.settingsForm.value;

    if (formValue.dayStartHour >= formValue.dayEndHour) {
      alert('Start hour must be before end hour');
      return;
    }

    const updatedConfig = {
      dayStartHour: Number(formValue.dayStartHour),
      dayEndHour: Number(formValue.dayEndHour),
      segmentsByHour: Number(formValue.segmentsByHour),
      logo: this.logoContent || undefined,
    };

    // updateProject pushes the new name/config into currentProject$ synchronously,
    // so the switcher label and the calendar grid rehydrate reactively. Close the
    // modal once the persistence call settles, without a full page reload.
    this.projectService
      .updateProject(currentProject.id, {
        name: formValue.name,
        config: updatedConfig,
      })
      .subscribe({
        next: () => this.activeModal.close(),
        error: () => this.activeModal.close(),
      });
  }

  close(): void {
    this.activeModal.dismiss();
  }
}
