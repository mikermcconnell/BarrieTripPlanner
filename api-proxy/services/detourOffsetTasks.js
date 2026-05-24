const { CloudTasksClient } = require('@google-cloud/tasks');

const DEFAULT_LOCATION = 'us-central1';
const DEFAULT_QUEUE = 'bttp-detour-offset-samples';

function parseFirebaseProjectId(env) {
  try {
    return JSON.parse(env.FIREBASE_CONFIG || '{}')?.projectId || '';
  } catch (_err) {
    return '';
  }
}

function appendSourceQuery(url, source) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}source=${encodeURIComponent(source)}`;
}

function buildOffsetTaskConfig(env = process.env) {
  const projectId =
    env.GCLOUD_PROJECT ||
    env.GOOGLE_CLOUD_PROJECT ||
    parseFirebaseProjectId(env);
  const location = env.DETOUR_OFFSET_TASK_LOCATION || env.CLOUD_TASKS_LOCATION || DEFAULT_LOCATION;
  const queue = env.DETOUR_OFFSET_TASK_QUEUE || DEFAULT_QUEUE;
  const targetUrl =
    env.DETOUR_OFFSET_TASK_TARGET_URL ||
    (env.API_PROXY_BASE_URL ? `${env.API_PROXY_BASE_URL.replace(/\/$/, '')}/api/detour-run-once` : '');
  const schedulerToken = (env.SCHEDULER_API_TOKEN || '').trim();

  return {
    projectId,
    location,
    queue,
    targetUrl,
    schedulerToken,
    schedulerTokenConfigured: Boolean(schedulerToken),
  };
}

function createOffsetSampleScheduler({
  client = new CloudTasksClient(),
  env = process.env,
  now = () => Date.now(),
} = {}) {
  const config = buildOffsetTaskConfig(env);

  async function enqueueOffsetSample({ delaySeconds = 30, source = 'offset-30s' } = {}) {
    if (!config.projectId || !config.location || !config.queue || !config.targetUrl) {
      return {
        ok: false,
        skipped: true,
        reason: 'offset-task-config-missing',
      };
    }

    if (!config.schedulerTokenConfigured) {
      return {
        ok: false,
        skipped: true,
        reason: 'scheduler-token-missing',
      };
    }

    const parent = client.queuePath(config.projectId, config.location, config.queue);
    const requestedAtMs = now();
    const scheduleTimeMs = requestedAtMs + delaySeconds * 1000;
    const taskMinute = Math.floor(requestedAtMs / 60000);
    const taskName = `${parent}/tasks/detour-offset-${taskMinute}`;

    const task = {
      name: taskName,
      scheduleTime: {
        seconds: Math.floor(scheduleTimeMs / 1000),
      },
      httpRequest: {
        httpMethod: 'POST',
        url: appendSourceQuery(config.targetUrl, source),
        headers: {
          'x-scheduler-token': config.schedulerToken,
          'x-detour-trigger-source': source,
        },
      },
    };

    try {
      const [createdTask] = await client.createTask({ parent, task });
      return {
        ok: true,
        taskName: createdTask?.name || taskName,
        scheduledFor: new Date(scheduleTimeMs).toISOString(),
        delaySeconds,
      };
    } catch (err) {
      if (err?.code === 6 || /already exists/i.test(err?.message || '')) {
        return {
          ok: true,
          skipped: true,
          reason: 'offset-task-already-exists',
          taskName,
          scheduledFor: new Date(scheduleTimeMs).toISOString(),
          delaySeconds,
        };
      }
      throw err;
    }
  }

  return {
    enqueueOffsetSample,
    config: {
      projectId: config.projectId,
      location: config.location,
      queue: config.queue,
      targetUrl: config.targetUrl,
      schedulerTokenConfigured: config.schedulerTokenConfigured,
    },
  };
}

module.exports = {
  buildOffsetTaskConfig,
  createOffsetSampleScheduler,
};
