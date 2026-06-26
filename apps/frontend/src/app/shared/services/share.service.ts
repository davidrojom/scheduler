import { Injectable } from '@angular/core';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root',
})
export class ShareService {
  constructor(private readonly configService: ConfigService) {}

  export(): string {
    const storedConfig = this.configService.getConfig();

    const storedConfigString = JSON.stringify(storedConfig);
    const storedConfigBase64 = btoa(storedConfigString);

    return storedConfigBase64;
  }
}
