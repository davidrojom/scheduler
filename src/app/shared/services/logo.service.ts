import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import DOMPurify from 'dompurify';

const LOGO_STORAGE_KEY = 'scheduler_logo';

@Injectable({
  providedIn: 'root',
})
export class LogoService {
  private logoSubject = new BehaviorSubject<string | null>(this.loadLogo());

  getLogo$(): Observable<string | null> {
    return this.logoSubject.asObservable();
  }

  getLogo(): string | null {
    return this.logoSubject.value;
  }

  setLogo(svgContent: string): void {
    const sanitizedSvg = this.sanitizeSvg(svgContent);
    localStorage.setItem(LOGO_STORAGE_KEY, sanitizedSvg);
    this.logoSubject.next(sanitizedSvg);
  }

  private sanitizeSvg(svgContent: string): string {
    // Configure DOMPurify to allow SVG elements but remove problematic attributes
    const clean = DOMPurify.sanitize(svgContent, {
      USE_PROFILES: { svg: true, svgFilters: false },
      ADD_TAGS: ['svg', 'path', 'circle', 'rect', 'g', 'line', 'polyline', 'polygon', 'ellipse', 'text', 'tspan'],
      FORBID_ATTR: ['inkscape:*', 'sodipodi:*', 'filter'],
      FORBID_TAGS: ['script', 'style', 'defs', 'filter', 'metadata', 'foreignObject'],
    });

    // Parse the cleaned SVG
    const parser = new DOMParser();
    const doc = parser.parseFromString(clean, 'image/svg+xml');
    const svgElement = doc.documentElement;

    // Remove namespace declarations that might cause issues
    const attrsToRemove = Array.from(svgElement.attributes)
      .filter(attr =>
        attr.name.startsWith('xmlns:') &&
        !['xmlns:svg', 'xmlns'].includes(attr.name)
      )
      .map(attr => attr.name);

    attrsToRemove.forEach(attr => svgElement.removeAttribute(attr));

    // Remove any remaining filter-related attributes from all elements
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

  removeLogo(): void {
    localStorage.removeItem(LOGO_STORAGE_KEY);
    this.logoSubject.next(null);
  }

  hasLogo(): boolean {
    return localStorage.getItem(LOGO_STORAGE_KEY) !== null;
  }

  private loadLogo(): string | null {
    return localStorage.getItem(LOGO_STORAGE_KEY);
  }
}
