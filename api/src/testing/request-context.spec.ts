import { currentUserId, runWithUser } from './request-context.js';

describe('request context', () => {
  it('keeps separate userId for concurrent runs', async () => {
    await Promise.all([
      runWithUser('user-1', async () => {
        await Promise.resolve();
        expect(currentUserId()).toBe('user-1');
      }),
      runWithUser('user-2', async () => {
        await Promise.resolve();
        expect(currentUserId()).toBe('user-2');
      }),
    ]);
  });

  it('restores outer userId after nested runWithUser', () => {
    runWithUser('user-a', () => {
      expect(currentUserId()).toBe('user-a');

      runWithUser('user-b', () => {
        expect(currentUserId()).toBe('user-b');
      });

      expect(currentUserId()).toBe('user-a');
    });
  });
});
