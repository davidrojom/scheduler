import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { v4 } from 'uuid';
import { ConfigService } from './config.service';

interface Column {
  id: string;
  title: string;
}

@Injectable({
  providedIn: 'root',
})
export class ColumnsService {
  private _columns: Column[] = [];

  private _columns$ = new BehaviorSubject<Column[]>([]);

  get columns$(): Observable<Column[]> {
    return this._columns$.asObservable();
  }

  get columns(): Column[] {
    return this._columns;
  }

  constructor(private readonly configService: ConfigService) {
    this.setColumns();
  }

  updateColumnOrder(columns: Column[]): void {
    this._columns = columns;

    this.configService.setColumns(columns);
  }

  setColumns() {
    const storedConfig = this.configService.getConfig();

    this._columns = storedConfig.columns;
    this._columns$.next(this._columns);
  }

  addColumn(title: string): void {
    this._columns.push({
      id: v4(),
      title,
    });

    this._columns$.next(this._columns);

    this.configService.setColumns(this._columns);
  }

  deleteColumn(id: string): void {
    this._columns = this._columns.filter((column) => column.id !== id);
    this._columns$.next(this._columns);

    this.configService.setColumns(this._columns);
  }

  wipeColumns(): void {
    this._columns = [];
    this._columns$.next(this._columns);

    this.configService.setColumns(this._columns);
  }

  updateColumn(id: string, title: string): void {
    this._columns = this._columns.map((column) => {
      if (column.id === id) {
        return {
          ...column,
          title,
        };
      }

      return column;
    });

    this._columns$.next(this._columns);

    this.configService.setColumns(this._columns);
  }
}
