import { Injectable } from '@angular/core';
import { BLANK_PDF, type Template, type Schema } from '@pdfme/common';
import { generate } from '@pdfme/generator';
import { format } from 'date-fns';
import { table, text, svg } from '@pdfme/schemas';
import { BlobWriter, ZipWriter, Uint8ArrayReader } from '@zip.js/zip.js';
import { toBlob } from 'html-to-image';
import { ProjectService } from './project.service';

interface ExportConfig {
  columns: {
    id: string;
    title: string;
  }[];
  tasks: {
    id: string;
    columnId: string;
    title: string;
    start: Date;
    end: Date;
    participants: string[];
    draggable: boolean;
    resizable: {
      beforeStart: boolean;
      afterEnd: boolean;
    };
    color: {
      primary: string;
      secondary: string;
    };
  }[];
  participants: {
    name: string;
  }[];
}

type Hour = string;
type Place = string;
type Description = string;

type PdfScheduleTuple = [Hour, Place, Description];

@Injectable({
  providedIn: 'root',
})
export class ExportService {
  constructor(private readonly projectService: ProjectService) {}

  private getParticipantTemplate(): Template {
    const logo = this.projectService.currentProject?.config.logo;

    const baseSchemas: Schema[] = [
      {
        name: 'title',
        type: 'text',
        position: {
          x: 25.62,
          y: logo ? 36.99 : 26.99,
        },
        width: 149.24,
        height: 9.99,
        rotate: 0,
        alignment: 'center',
        verticalAlignment: 'top',
        fontSize: 21,
        lineHeight: 1,
        characterSpacing: 0,
        fontColor: '#000000',
        backgroundColor: '',
        opacity: 1,
        strikethrough: false,
        underline: true,
        required: true,
        readOnly: false,
        fontName: 'Roboto',
      },
      {
        name: 'schedule',
        type: 'table',
        position: {
          x: 26.14,
          y: logo ? 55.92 : 45.92,
        },
        width: 150,
        height: 32.348,
        showHead: true,
        head: ['Time', 'Place', 'Description'],
        headWidthPercentages: [30, 30, 40],
        tableStyles: {
          borderWidth: 0.3,
          borderColor: '#000000',
        },
        headStyles: {
          fontName: 'Roboto',
          fontSize: 13,
          characterSpacing: 0,
          alignment: 'left',
          verticalAlignment: 'middle',
          lineHeight: 1,
          fontColor: '#ffffff',
          borderColor: '',
          backgroundColor: '#2980ba',
          borderWidth: {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          },
          padding: {
            top: 5,
            right: 5,
            bottom: 5,
            left: 5,
          },
        },
        bodyStyles: {
          fontName: 'Roboto',
          fontSize: 11,
          characterSpacing: 0,
          alignment: 'left',
          verticalAlignment: 'middle',
          lineHeight: 1,
          fontColor: '#000000',
          borderColor: '#888888',
          backgroundColor: '',
          alternateBackgroundColor: '#f5f5f5',
          borderWidth: {
            top: 0.1,
            right: 0.1,
            bottom: 0.1,
            left: 0.1,
          },
          padding: {
            top: 5,
            right: 5,
            bottom: 5,
            left: 5,
          },
        },
        columnStyles: {},
        required: false,
        readOnly: false,
      },
    ];

    if (logo) {
      baseSchemas.push({
        name: 'image',
        type: 'svg',
        content: logo,
        position: {
          x: 10,
          y: 10,
        },
        readOnly: true,
        width: 75,
        height: 12.5,
        required: false,
      });
    }

    return {
      schemas: [baseSchemas],
      basePdf: BLANK_PDF,
      pdfmeVersion: '5.0.0',
    };
  }

  async exportParticipantSchedules(config: ExportConfig): Promise<void> {
    const columnsById = new Map<string, ExportConfig['columns'][number]>(
      config.columns.map((column) => [column.id, column])
    );

    const generatedSchedules: {
      participant: string;
      pdf: Uint8Array;
    }[] = [];

    for (const participant of config.participants) {
      const tasksOfParticipant = config.tasks
        .filter((task) => task.participants.includes(participant.name))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      if (!tasksOfParticipant.length) {
        continue;
      }

      const tuples: PdfScheduleTuple[] = tasksOfParticipant.map((task) => {
        const columnOfTask = columnsById.get(task.columnId);

        if (!columnOfTask) {
          throw new Error(`Column with id ${task.columnId} not found`);
        }

        return [
          `${format(task.start, 'HH:mm')}-${format(task.end, 'HH:mm')}`,
          columnsById.get(task.columnId)!.title,
          task.title,
        ];
      });

      const pdf = await generate({
        template: this.getParticipantTemplate(),
        inputs: [
          {
            title: participant.name,
            schedule: tuples,
          },
        ],
        plugins: {
          Table: table,
          Text: text,
          Svg: svg,
        },
      });

      generatedSchedules.push({
        participant: participant.name,
        pdf,
      });
    }

    if (!generatedSchedules.length) {
      alert('No schedules to export. Make sure you have participants with assigned tasks.');
      return;
    }

    const zipFileWriter = new BlobWriter('application/zip');
    const zipWriter = new ZipWriter(zipFileWriter);

    for (const generatedSchedule of generatedSchedules) {
      const reader = new Uint8ArrayReader(generatedSchedule.pdf);
      await zipWriter.add(
        `schedule/${generatedSchedule.participant}.pdf`,
        reader
      );
    }

    await zipWriter.close();

    const blob = await zipFileWriter.getData();

    this.downloadBlob(blob, 'schedules.zip');
  }

  async captureAndDownloadNode(nodeReference: string) {
    const worker = new Worker(
      new URL('../workers/image.worker', import.meta.url),
      {
        type: 'module',
      }
    );

    const $node = document.querySelector(nodeReference);

    if (!$node) {
      throw new Error(`Node with reference ${nodeReference} not found`);
    }

    worker.postMessage({
      nodeHTML: $node.outerHTML,
      options: {
        skipFonts: true,
        width: $node.scrollWidth,
        height: $node.scrollHeight,
        backgroundColor: '#bfdbfe',
        type: 'image/png',
      },
    });

    worker.onmessage = ({ data }) => {
      if (data.error) {
        console.error(data.error);
        throw new Error(data.error);
      }

      this.downloadBlob(data.imageBlob, 'schedule.png');

      worker.terminate();
    };
  }

  async takeScreenshotOfNodeAndDownload(nodeReference: string): Promise<void> {
    const $node = document.querySelector(nodeReference);

    if (!$node) {
      throw new Error(`Node with reference ${nodeReference} not found`);
    }

    // TODO(David): extract this logic to a worker
    const imageBlob = await toBlob($node as HTMLElement, {
      skipFonts: true,
      width: $node.scrollWidth,
      height: $node.scrollHeight,
      backgroundColor: '#bfdbfe',
      type: 'image/png',
    });

    if (!imageBlob) {
      throw new Error('Failed to take screenshot');
    }

    this.downloadBlob(imageBlob, 'schedule.png');
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
