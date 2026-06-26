import { Injectable } from '@angular/core';
import { ConfigService } from './config.service';
import { BehaviorSubject } from 'rxjs';

export interface Participant {
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class ParticipantsService {
  private _participants: Participant[] = [];
  private _participants$ = new BehaviorSubject<Participant[]>([]);

  get participants$() {
    return this._participants$.asObservable();
  }

  get participants(): Participant[] {
    return this._participants;
  }

  constructor(private readonly configService: ConfigService) {
    this.setParticipants();
  }

  addParticipant(name: string): void {
    this._participants.push({
      name,
    });

    this._participants$.next(this._participants);

    this.configService.setParticipants(
      this._participants.map((participant) => participant.name)
    );
  }

  setParticipants(): void {
    const storedConfig = this.configService.getConfig();

    this._participants = storedConfig.participants.map((participant) => ({
      name: participant,
    }));
    this._participants$.next(this._participants);

    this.rebuildParticipantsFromTasks();
  }

  private rebuildParticipantsFromTasks(): void {
    const storedConfig = this.configService.getConfig();

    const participantNamesInTasks = new Set<string>();
    storedConfig.tasks.forEach((task) => {
      task.participants.forEach((participantName) => {
        participantNamesInTasks.add(participantName);
      });
    });

    let needsUpdate = false;
    participantNamesInTasks.forEach((name) => {
      if (!this.hasParticipant(name)) {
        this._participants.push({ name });
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      this._participants$.next(this._participants);
      this.configService.setParticipants(
        this._participants.map((participant) => participant.name)
      );
    }
  }

  deleteParticipant(name: string): void {
    this._participants = this._participants.filter(
      (participant) => participant.name !== name
    );

    this._participants$.next(this._participants);

    this.configService.setParticipants(
      this._participants.map((participant) => participant.name)
    );
  }

  hasParticipant(name: string) {
    return this._participants.some((participant) => participant.name === name);
  }

  createIfNotExists(name: string): void {
    if (!this.hasParticipant(name)) {
      this.addParticipant(name);
    }
  }

  findByName(name: string): Participant | undefined {
    return this._participants.find((participant) => participant.name === name);
  }

  wipeParticipants(): void {
    this._participants = [];
    this._participants$.next(this._participants);

    this.configService.setParticipants([]);
  }
}
