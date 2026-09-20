export const abortError = () => Object.assign(new Error('Request cancelled'), { name: 'AbortError' });
export const throwIfAborted = (signal) => {
  if (signal?.aborted) throw abortError();
};

// Settle promptly even if the provider ignores AbortSignal. Work must check the
// supplied signal before publishing results or writing caches after an await.
export const runBounded = (work, { signal, timeoutMs = 15000 } = {}) => {
  throwIfAborted(signal);
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      callback(value);
    };
    const cancel = () => {
      finish(reject, abortError());
      controller.abort();
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    timer = setTimeout(() => {
      finish(reject, Object.assign(new Error('This request is taking too long. Please try again.'), { name: 'TimeoutError' }));
      controller.abort();
    }, timeoutMs);
    Promise.resolve().then(() => {
      throwIfAborted(controller.signal);
      return work(controller.signal);
    }).then(value => finish(resolve, value), error => finish(reject, error));
  });
};

export const abortableDelay = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(abortError()); return; }
  const cancel = () => { clearTimeout(timer); reject(abortError()); };
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', cancel);
    resolve();
  }, ms);
  signal?.addEventListener('abort', cancel, { once: true });
});
