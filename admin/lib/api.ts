import { getAccessToken, redirectToLogin } from './auth';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  meta: PaginationMeta;
};

export type AcademicListResponse<T> = {
  data: T[];
  meta: PaginationMeta;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

function apiUrl(path: string, query?: QueryParams): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error('NEXT_PUBLIC_API_URL is not configured');
  const url = new URL(
    `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`,
  );
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined;
  return response.json();
}

export async function adminApi<T>(
  path: string,
  options: RequestInit & { query?: QueryParams } = {},
): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    redirectToLogin();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  const { query, headers, ...requestOptions } = options;
  const response = await fetch(apiUrl(path, query), {
    ...requestOptions,
    headers: {
      Authorization: `Bearer ${token}`,
      ...headers,
    },
  });
  const body = await readBody(response);

  if (response.status === 401) {
    redirectToLogin();
  }
  if (!response.ok) {
    const details = body as { message?: string | string[]; code?: string } | undefined;
    const message = Array.isArray(details?.message)
      ? details.message.join(', ')
      : details?.message ?? 'The request could not be completed.';
    throw new ApiError(response.status, message, details?.code);
  }

  return body as T;
}

export function adminGet<T>(path: string, query?: QueryParams) {
  return adminApi<T>(path, { query });
}

export function adminMutation<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
) {
  return adminApi<T>(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
