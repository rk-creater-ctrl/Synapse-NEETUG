import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

export type UploadedImportFile = {
  originalname: string;
  size: number;
  buffer: Buffer;
};

export type ParsedImport = {
  filename: string;
  checksum: string;
  headers: string[];
  rows: Array<Record<string, string>>;
};

export function neutralizeForSpreadsheetExport(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function parseImportFile(file: UploadedImportFile | undefined): ParsedImport {
  if (!file || !file.buffer) {
    throw new BadRequestException({ code: 'IMPORT_UNSUPPORTED_FILE', message: 'A CSV or XLSX file is required.' });
  }
  if (file.size > MAX_IMPORT_BYTES || file.buffer.length > MAX_IMPORT_BYTES) {
    throw new BadRequestException({ code: 'IMPORT_FILE_TOO_LARGE', message: 'Import files may not exceed 5 MB.' });
  }

  const filename = sanitizeFilename(file.originalname);
  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension !== 'csv' && extension !== 'xlsx') {
    throw new BadRequestException({ code: 'IMPORT_UNSUPPORTED_FILE', message: 'Only .csv and .xlsx files are supported.' });
  }

  let matrix: unknown[][];
  try {
    matrix = extension === 'csv' ? parseCsv(file.buffer) : parseWorkbook(file.buffer);
  } catch {
    throw new BadRequestException({ code: 'IMPORT_INVALID_FILE', message: 'The import file could not be parsed.' });
  }
  if (matrix.length === 0) {
    throw new BadRequestException({ code: 'IMPORT_INVALID_HEADERS', message: 'The import file must contain a header row.' });
  }

  const headers = normalizeHeaders(matrix[0]);
  const sourceRows = matrix.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  if (sourceRows.length === 0) {
    throw new BadRequestException({
      code: 'IMPORT_INVALID_FILE',
      message: 'The import file must contain at least one data row.',
    });
  }
  if (sourceRows.length > MAX_IMPORT_ROWS) {
    throw new BadRequestException({ code: 'IMPORT_TOO_MANY_ROWS', message: 'An import may contain at most 500 data rows.' });
  }
  const rows = sourceRows.map((row) => {
    if (row.length > headers.length) {
      throw new BadRequestException({ code: 'IMPORT_INVALID_FILE', message: 'A row has more values than the header row.' });
    }
    return Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row[index])]));
  });

  return {
    filename,
    checksum: createHash('sha256').update(file.buffer).digest('hex'),
    headers,
    rows,
  };
}

function parseCsv(buffer: Buffer): unknown[][] {
  return parse(buffer.toString('utf8'), {
    bom: true,
    relax_column_count: false,
    skip_empty_lines: true,
    trim: false,
  }) as unknown[][];
}

function parseWorkbook(buffer: Buffer): unknown[][] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellText: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error('No worksheet');
  const sheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
}

function normalizeHeaders(values: unknown[]): string[] {
  const headers = values.map((value) => normalizeHeader(String(value ?? '')));
  if (headers.length === 0 || headers.some((header) => !header)) {
    throw new BadRequestException({ code: 'IMPORT_INVALID_HEADERS', message: 'Headers must be non-empty.' });
  }
  if (new Set(headers).size !== headers.length) {
    throw new BadRequestException({ code: 'IMPORT_INVALID_HEADERS', message: 'Headers must be unique after normalization.' });
  }
  return headers;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f]/g, '');
  return (base || 'import').slice(0, 255);
}
