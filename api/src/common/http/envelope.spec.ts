import { noContent, toList, toResource, unwrapEnvelope } from './envelope.js';

describe('envelope helpers', () => {
  it('lista', () => {
    const rows = [{ id: '1' }, { id: '2' }];
    const marked = toList(rows, { page: 1, pageSize: 20, total: 2 });
    const body = unwrapEnvelope(marked) as {
      data: unknown[];
      meta: { total: number };
    };
    expect(body.meta.total).toBe(2);
    expect(body.data).toHaveLength(2);
  });

  it('uno', () => {
    const entity = { id: '1', name: 'Acme' };
    expect(unwrapEnvelope(toResource(entity))).toEqual({ data: entity });
  });

  it('delete', () => {
    expect(unwrapEnvelope(noContent())).toBeUndefined();
  });
});
