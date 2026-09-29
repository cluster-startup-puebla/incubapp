import { createPrismaMock } from './prisma-mock.js';

describe('createPrismaMock', () => {
  it('does not share call state between instances', async () => {
    const first = createPrismaMock();
    const second = createPrismaMock();

    await first.findMany({ where: { id: 'a' } });

    expect(first.findMany.calls).toHaveLength(1);
    expect(second.findMany.calls).toHaveLength(0);
    expect(second.findFirst.calls).toHaveLength(0);
    expect(second.count.calls).toHaveLength(0);
    expect(second.update.calls).toHaveLength(0);
  });
});
