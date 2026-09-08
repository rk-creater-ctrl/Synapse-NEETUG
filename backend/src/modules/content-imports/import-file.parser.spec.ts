import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  neutralizeForSpreadsheetExport,
  parseImportFile,
} from './import-file.parser';

const file = (name: string, content: string | Buffer) => {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return { originalname: name, buffer, size: buffer.length };
};

const errorCode = (callback: () => unknown) => {
  try {
    callback();
  } catch (error) {
    if (error instanceof BadRequestException) {
      return (error.getResponse() as { code?: string }).code;
    }
    throw error;
  }
  return undefined;
};

function xlsxBuffer(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Import');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('import file parser', () => {
  it('parses CSV data without interpreting formula-looking content', () => {
    const parsed = parseImportFile(
      file('cards.csv', 'front_content,back_content\n=SUM(A1),Answer'),
    );

    expect(parsed.rows[0].front_content).toBe('=SUM(A1)');
  });

  it('parses XLSX data as plain values', () => {
    const parsed = parseImportFile(
      file('cards.xlsx', xlsxBuffer([['front_content', 'back_content'], ['Force', 'Mass × acceleration']])),
    );

    expect(parsed.headers).toEqual(['front_content', 'back_content']);
    expect(parsed.rows).toEqual([{ front_content: 'Force', back_content: 'Mass × acceleration' }]);
  });

  it('rejects unsupported extensions and over-limit files with machine-readable codes', () => {
    expect(errorCode(() => parseImportFile(file('cards.txt', 'title')))).toBe(
      'IMPORT_UNSUPPORTED_FILE',
    );
    expect(
      errorCode(() =>
        parseImportFile({
          originalname: 'cards.csv',
          size: MAX_IMPORT_BYTES + 1,
          buffer: Buffer.alloc(0),
        }),
      ),
    ).toBe('IMPORT_FILE_TOO_LARGE');
  });

  it('rejects malformed CSV and corrupt workbooks', () => {
    expect(errorCode(() => parseImportFile(file('cards.csv', 'title\n"unterminated')))).toBe(
      'IMPORT_INVALID_FILE',
    );
    expect(errorCode(() => parseImportFile(file('cards.xlsx', Buffer.from('not-a-workbook'))))).toBe(
      'IMPORT_INVALID_FILE',
    );
  });

  it('rejects missing, empty, and duplicate normalized headers', () => {
    expect(errorCode(() => parseImportFile(file('cards.csv', ',title\nA,B')))).toBe(
      'IMPORT_INVALID_HEADERS',
    );
    expect(errorCode(() => parseImportFile(file('cards.csv', 'Title,title\nA,B')))).toBe(
      'IMPORT_INVALID_HEADERS',
    );
    expect(errorCode(() => parseImportFile(file('cards.csv', 'title\n')))).toBe(
      'IMPORT_INVALID_FILE',
    );
  });

  it('accepts exactly 500 data rows and rejects 501 rows', () => {
    const header = 'name,slug';
    const rows = Array.from(
      { length: MAX_IMPORT_ROWS },
      (_, index) => `Exam ${index},exam-${index}`,
    );
    const accepted = parseImportFile(file('exams.csv', [header, ...rows].join('\n')));
    expect(accepted.rows).toHaveLength(MAX_IMPORT_ROWS);

    expect(
      errorCode(() =>
        parseImportFile(file('exams.csv', [header, ...rows, 'One more,one-more'].join('\n'))),
      ),
    ).toBe('IMPORT_TOO_MANY_ROWS');
  });

  it('sanitizes stored filename metadata and retains source data unchanged', () => {
    const parsed = parseImportFile(
      file('C:\\unsafe\\cards.csv', 'front_content,back_content\n+F1,Answer'),
    );

    expect(parsed.filename).toBe('cards.csv');
    expect(parsed.rows[0].front_content).toBe('+F1');
  });

  it('provides future export neutralization without mutating stored content', () => {
    expect(neutralizeForSpreadsheetExport('@formula')).toBe("'@formula");
    expect(neutralizeForSpreadsheetExport('ordinary text')).toBe('ordinary text');
  });
});
