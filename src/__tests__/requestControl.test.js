const { runBounded, abortableDelay } = require('../utils/requestControl');

afterEach(() => jest.useRealTimers());
test('a timeout settles and aborts even when the provider never responds', async () => {
  jest.useFakeTimers(); let requestSignal;
  const operation = runBounded(signal => { requestSignal = signal; return new Promise(() => {}); }, { timeoutMs:1000 });
  const assertion = expect(operation).rejects.toMatchObject({name:'TimeoutError'});
  await jest.advanceTimersByTimeAsync(1000); await assertion;
  expect(requestSignal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});
test('cancellation aborts active work and clears the deadline', async () => {
  jest.useFakeTimers(); const controller = new AbortController(); let requestSignal;
  const operation = runBounded(signal => { requestSignal = signal; return new Promise(() => {}); }, {signal:controller.signal});
  const assertion = expect(operation).rejects.toMatchObject({name:'AbortError'});
  await Promise.resolve(); controller.abort(); await assertion;
  expect(requestSignal.aborted).toBe(true); expect(jest.getTimerCount()).toBe(0);
});
test('successful work clears its timer and parent listener', async () => {
  jest.useFakeTimers(); const controller = new AbortController(); const remove = jest.spyOn(controller.signal,'removeEventListener');
  await expect(runBounded(async()=>42,{signal:controller.signal})).resolves.toBe(42);
  expect(jest.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalled();
});
test('an aborted rate-limit wait does not consume its full delay', async () => {
  jest.useFakeTimers(); const controller = new AbortController();
  const delay = abortableDelay(550,controller.signal); const assertion = expect(delay).rejects.toMatchObject({name:'AbortError'});
  controller.abort(); await assertion; expect(jest.getTimerCount()).toBe(0);
});
