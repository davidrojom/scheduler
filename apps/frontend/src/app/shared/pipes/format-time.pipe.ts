import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatTime',
  standalone: true,
})
export class FormatTimePipe implements PipeTransform {
  /**
   * Transform hours and minutes into a readable format
   * @param totalMinutes - Total duration in minutes
   * @returns Formatted string like "2 hours 30 minutes" or "10 minutes"
   */
  transform(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    if (hours === 0) {
      return `${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
    }

    if (remainingMinutes === 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }

    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
  }
}
