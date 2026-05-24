const { createOffsetSampleScheduler, buildOffsetTaskConfig } = require('../services/detourOffsetTasks');

describe('detourOffsetTasks', () => {
  test('builds delayed task config from environment', () => {
    const config = buildOffsetTaskConfig({
      GCLOUD_PROJECT: 'project-1',
      DETOUR_OFFSET_TASK_LOCATION: 'us-central1',
      DETOUR_OFFSET_TASK_QUEUE: 'detour-offset',
      DETOUR_OFFSET_TASK_TARGET_URL: 'https://example.com/api/detour-run-once',
      SCHEDULER_API_TOKEN: 'secret-token',
    });

    expect(config).toMatchObject({
      projectId: 'project-1',
      location: 'us-central1',
      queue: 'detour-offset',
      targetUrl: 'https://example.com/api/detour-run-once',
      schedulerTokenConfigured: true,
    });
  });

  test('creates an HTTP task scheduled for the offset run', async () => {
    const createTask = jest.fn().mockResolvedValue([{ name: 'task-name' }]);
    const scheduler = createOffsetSampleScheduler({
      client: { queuePath: () => 'projects/p/locations/l/queues/q', createTask },
      env: {
        GCLOUD_PROJECT: 'p',
        DETOUR_OFFSET_TASK_LOCATION: 'l',
        DETOUR_OFFSET_TASK_QUEUE: 'q',
        DETOUR_OFFSET_TASK_TARGET_URL: 'https://example.com/api/detour-run-once',
        SCHEDULER_API_TOKEN: 'secret-token',
      },
      now: () => Date.parse('2026-05-24T19:00:05Z'),
    });

    const result = await scheduler.enqueueOffsetSample({ delaySeconds: 30, source: 'offset-30s' });

    expect(result).toMatchObject({ ok: true, taskName: 'task-name', delaySeconds: 30 });
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      parent: 'projects/p/locations/l/queues/q',
      task: expect.objectContaining({
        scheduleTime: { seconds: Math.floor(Date.parse('2026-05-24T19:00:35Z') / 1000) },
        httpRequest: expect.objectContaining({
          httpMethod: 'POST',
          url: 'https://example.com/api/detour-run-once?source=offset-30s',
          headers: expect.objectContaining({ 'x-scheduler-token': 'secret-token' }),
        }),
      }),
    }));
  });
});
