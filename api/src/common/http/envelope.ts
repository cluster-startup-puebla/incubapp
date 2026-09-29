export const ENVELOPE_KIND = Symbol('incubapp.envelope');

export type ListMeta = {
  page: number;
  pageSize: number;
  total?: number;
  nextCursor?: string | null;
};

export type ListEnvelope<T> = {
  [ENVELOPE_KIND]: 'list';
  data: T[];
  meta: ListMeta;
};

export type ResourceEnvelope<T> = {
  [ENVELOPE_KIND]: 'resource';
  data: T;
};

export type EmptyEnvelope = {
  [ENVELOPE_KIND]: 'empty';
};

export type EnvelopeMarker<T> =
  ListEnvelope<T> | ResourceEnvelope<T> | EmptyEnvelope;

export function toList<T>(data: T[], meta: ListMeta): ListEnvelope<T> {
  return {
    [ENVELOPE_KIND]: 'list',
    data,
    meta,
  };
}

export function toResource<T>(data: T): ResourceEnvelope<T> {
  return {
    [ENVELOPE_KIND]: 'resource',
    data,
  };
}

/** Marker for explicit 204 semantics in helpers/tests. */
export function noContent(): EmptyEnvelope {
  return { [ENVELOPE_KIND]: 'empty' };
}

export function isEnvelope(value: unknown): value is EnvelopeMarker<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    ENVELOPE_KIND in value &&
    ((value as EnvelopeMarker<unknown>)[ENVELOPE_KIND] === 'list' ||
      (value as EnvelopeMarker<unknown>)[ENVELOPE_KIND] === 'resource' ||
      (value as EnvelopeMarker<unknown>)[ENVELOPE_KIND] === 'empty')
  );
}

export function unwrapEnvelope(value: EnvelopeMarker<unknown>): unknown {
  switch (value[ENVELOPE_KIND]) {
    case 'list':
      return { data: value.data, meta: value.meta };
    case 'resource':
      return { data: value.data };
    case 'empty':
      return undefined;
  }
}
