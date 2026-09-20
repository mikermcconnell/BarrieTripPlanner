const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../context/TransitContext.js'), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));

// Execute the actual critical-path callbacks with deferred IO. These tests isolate
// ordering, not mounted React rendering or real-device startup elapsed time.
const loadCallback = (name, env) => {
  const start = source.indexOf(`const ${name} = useCallback(async `);
  const end = source.indexOf('}, [applyStaticData, cacheGTFSDataInBackground, processAndStoreShapes]);', start);
  if (start < 0 || end < 0) throw new Error('Critical-path callback boundary changed');
  const body = source.slice(start, end).split('=> {').slice(1).join('=> {');
  return new Function(...Object.keys(env), `return async ({ onProgress } = {}) => {${body}}`)(...Object.values(env));
};
const environment = () => {
  const env = {};
  for (const name of ['setIsLoadingStatic','setIsRefreshingStatic','setStaticError','setUsingCachedData','setIsOffline','applyStaticData','processAndStoreShapes','setLastStaticRefreshAt','setRoutingData','setIsRoutingReady','setLastRoutingBuildAt','setRoutingError','setLastStaticFailureAt','setIsBuildingRouting','setLastRoutingFailureAt']) env[name] = jest.fn();
  for (const name of ['gtfsDataRef','gtfsFetchPromiseRef','routingDataRef','routingBuildPromiseRef']) env[name] = { current: null };
  return {...env, logger:{warn:jest.fn(),error:jest.fn()},getUserFacingErrorMessage:(_,text)=>text,
    cacheGTFSDataInBackground:jest.fn(async()=>{}),buildRoutingDataAsync:jest.fn(async()=>({})),
    fetchAllStaticData:jest.fn(async()=>({routes:[],stops:[],stopTimes:[],shapes:{}}))};
};

test('cached map becomes usable while connectivity detection is still pending', async () => {
  const online = deferred(); const env = environment();
  const cached = {routes:[{id:'1'}],stops:[{id:'O'}],shapes:{}};
  env.isOnline = () => online.promise; env.getCachedGTFSData = async () => cached;
  const loading = loadCallback('loadStaticData', env)(); await flush();
  expect(env.applyStaticData).toHaveBeenCalledWith(cached);
  expect(env.setIsLoadingStatic).toHaveBeenLastCalledWith(false);
  expect(env.fetchAllStaticData).not.toHaveBeenCalled();
  online.resolve(false); await loading;
  expect(env.setIsOffline).toHaveBeenLastCalledWith(true);
});

test('first routing index is ready without waiting for cache persistence', async () => {
  const write = deferred(); const env = environment();
  env.gtfsDataRef.current = {routes:[{}],stops:[{}]};
  env.cacheGTFSDataInBackground = jest.fn(() => write.promise);
  const routing = await loadCallback('ensureRoutingData', env)();
  expect(routing).toBe(env.routingDataRef.current);
  expect(env.buildRoutingDataAsync).toHaveBeenCalledTimes(1);
  expect(env.setIsRoutingReady).toHaveBeenCalledWith(true);
  write.resolve();
});

test('offline first launch without cached data still gives an error', async () => {
  const env = environment(); env.isOnline = async () => false; env.getCachedGTFSData = async () => null;
  await loadCallback('loadStaticData', env)();
  expect(env.fetchAllStaticData).not.toHaveBeenCalled();
  expect(env.setStaticError).toHaveBeenCalledWith('No internet connection and no cached data available');
  expect(env.setIsLoadingStatic).toHaveBeenLastCalledWith(false);
});

test('a search finishing during connectivity detection does not trigger a duplicate refresh', async () => {
  const env = environment(); const online = deferred();
  env.isOnline = () => online.promise; env.getCachedGTFSData = async () => ({routes:[{}],stops:[{}]});
  const startup = loadCallback('loadStaticData', env)(); await flush();
  await loadCallback('ensureRoutingData', env)();
  online.resolve(true); await startup;
  expect(env.fetchAllStaticData).toHaveBeenCalledTimes(1);
  expect(env.routingDataRef.current).not.toBeNull();
});
