import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectService } from '../../../../shared/services/project.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { Project } from '../../../../shared/models/project.model';
import { Observable } from 'rxjs';
import { ScrollableTextDirective } from '../../../../shared/directives/scrollable-text.directive';
import { HlmButtonDirective } from '../../../../shared/ui/spartan';

@Component({
  selector: 'sch-project-switcher',
  standalone: true,
  imports: [CommonModule, ScrollableTextDirective, HlmButtonDirective],
  templateUrl: './project-switcher.component.html',
  styleUrl: './project-switcher.component.scss'
})
export class ProjectSwitcherComponent implements OnInit {
  projects$!: Observable<Project[]>;
  currentProject$!: Observable<Project | null>;
  showDropdown = false;

  constructor(
    private projectService: ProjectService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.projects$ = this.projectService.projects$;
    this.currentProject$ = this.projectService.currentProject$;
  }

  canDelete(project: Project, projects: Project[]): boolean {
    if (this.authService.isAuthenticated) {
      return project.myRole === 'owner';
    }
    return projects.length > 1;
  }

  toggleDropdown(): void {
    this.showDropdown = !this.showDropdown;
  }

  switchProject(projectId: string): void {
    this.showDropdown = false;
    this.projectService.switchProject(projectId);
  }

  createNewProject(): void {
    const name = prompt('Enter project name:');
    if (name && name.trim()) {
      const newProject = this.projectService.createProject(name.trim());
      this.projectService.switchProject(newProject.id);
    }
  }

  deleteProject(event: Event, projectId: string): void {
    event.stopPropagation();
    const project = this.projectService.projects.find(p => p.id === projectId);
    if (!project) return;

    const confirmed = confirm(`Are you sure you want to delete "${project.name}"?\n\nThis will permanently delete all columns, tasks, and participants in this project.`);
    if (confirmed) {
      this.projectService.deleteProject(projectId);
    }
  }
}
