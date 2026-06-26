import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class MobileDetectionService {
  private _isMobile: boolean;

  constructor() {
    this._isMobile = this.detectMobile();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        this._isMobile = this.detectMobile();
      });
    }
  }

  private detectMobile(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const hasTouchScreen =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const isSmallScreen = window.innerWidth <= 768;

    const mobileRegex =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    const isMobileUserAgent = mobileRegex.test(navigator.userAgent);

    return hasTouchScreen && (isSmallScreen || isMobileUserAgent);
  }

  public get isMobile(): boolean {
    return this._isMobile;
  }

  public get isTouch(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
}
