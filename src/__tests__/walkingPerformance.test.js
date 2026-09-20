const mockStorage = new Map();
jest.mock('@react-native-async-storage/async-storage',()=>({
  getItem:jest.fn(async key=>mockStorage.get(key)||null),
  setItem:jest.fn(async(key,value)=>mockStorage.set(key,value)),
  removeItem:jest.fn(async key=>mockStorage.delete(key)),
}));
jest.mock('../utils/logger',()=>({warn:jest.fn(),error:jest.fn(),log:jest.fn()}));
jest.mock('../services/proxyAuth',()=>({getApiProxyRequestOptions:jest.fn(async()=>({headers:{}}))}));
const epoch = new Date(2026,8,20,8).getTime();
const walk = (n,start) => ({mode:'WALK',duration:60,distance:100,startTime:start,endTime:start+60000,
  from:{lat:44.38+n*.001,lon:-79.7},to:{lat:44.3805+n*.001,lon:-79.699}});
const trip = n => { const start=epoch+3600000;return {id:String(n),startTime:start,endTime:start+720000,duration:720,
  legs:[walk(n*2,start),{mode:'BUS',tripId:String(n),startTime:start+60000,endTime:start+660000,duration:600,from:{},to:{}},walk(n*2+1,start+660000)]};};
const response = () => ({ok:true,json:async()=>({routes:[{distance:100,duration:60,geometry:'test',legs:[{steps:[]}]}]})});
beforeEach(()=>{jest.resetModules();jest.useFakeTimers({now:epoch});});
afterEach(()=>{jest.useRealTimers();delete global.fetch;mockStorage.clear();});

test('first validated candidate is ready at 600ms instead of waiting for the 6100ms batch',async()=>{
  const {enrichTripPlanWithWalking}=require('../services/walkingService');
  const starts=[];const previews=[];
  global.fetch=jest.fn(async()=>{starts.push(Date.now()-epoch);await new Promise(r=>setTimeout(r,50));return response();});
  let finished=false;
  const work=enrichTripPlanWithWalking({itineraries:Array.from({length:6},(_,n)=>trip(n))},{onCandidateReady:async it=>{previews.push({time:Date.now()-epoch,it});return true;}}).then(r=>{finished=true;return r;});
  await jest.advanceTimersByTimeAsync(600);
  expect(previews).toHaveLength(1);expect(previews[0].time).toBe(600);expect(previews[0].it.isRecommended).toBe(false);expect(finished).toBe(false);
  await jest.advanceTimersByTimeAsync(5500);await work;
  expect(starts).toHaveLength(12);expect(starts.at(-1)).toBe(6050);expect(finished).toBe(true);
  const before=global.fetch.mock.calls.length;
  await enrichTripPlanWithWalking({itineraries:Array.from({length:6},(_,n)=>trip(n))});
  expect(global.fetch.mock.calls.length).toBe(before);
});

test('stalled walking requests finish with labelled estimates at the deadline',async()=>{
  const {getWalkingDirections}=require('../services/walkingService');let signal;
  global.fetch=jest.fn((_url,opts)=>{signal=opts.signal;return new Promise(()=>{});});
  const work=getWalkingDirections(44.4,-79.7,44.401,-79.701);
  await jest.advanceTimersByTimeAsync(15000);
  const result=await work;expect(signal.aborted).toBe(true);expect(result.source).not.toBe('locationiq');
});

test('cancellation aborts the request, stops later legs and rejects late data without cache writes',async()=>{
  const {enrichTripPlanWithWalking}=require('../services/walkingService');const controller=new AbortController();let resolve;let signal;
  global.fetch=jest.fn((_url,opts)=>{signal=opts.signal;return new Promise(r=>{resolve=r;});});
  const callback=jest.fn();const work=enrichTripPlanWithWalking({itineraries:[trip(0),trip(1)]},{signal:controller.signal,onCandidateReady:callback});
  const assertion=expect(work).rejects.toMatchObject({name:'AbortError'});
  await jest.advanceTimersByTimeAsync(1);controller.abort();await assertion;
  expect(signal.aborted).toBe(true);resolve(response());await jest.advanceTimersByTimeAsync(30000);
  expect(global.fetch).toHaveBeenCalledTimes(1);expect(callback).not.toHaveBeenCalled();expect(mockStorage.size).toBe(0);
});

test('concurrent callers still reserve separate 550ms provider slots',async()=>{
  const {getWalkingDirections}=require('../services/walkingService');const starts=[];
  global.fetch=jest.fn(async()=>{starts.push(Date.now()-epoch);return response();});
  const all=Promise.all([0,1,2].map(n=>getWalkingDirections(44.4+n*.01,-79.7,44.401+n*.01,-79.701)));
  await jest.advanceTimersByTimeAsync(1200);await all;expect(starts).toEqual([0,550,1100]);
});

test('a candidate rejected by live validation does not prevent checking the next one',async()=>{
  const {enrichTripPlanWithWalking}=require('../services/walkingService');global.fetch=jest.fn(async()=>response());
  const callback=jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  const work=enrichTripPlanWithWalking({itineraries:[trip(0),trip(1),trip(2)]},{onCandidateReady:callback});
  await jest.advanceTimersByTimeAsync(4000);await work;expect(callback).toHaveBeenCalledTimes(2);
});

test('estimated walking directions are not advertised as an early validated preview',async()=>{
  const {enrichTripPlanWithWalking}=require('../services/walkingService');global.fetch=jest.fn(async()=>({ok:false,status:503}));
  const callback=jest.fn();const work=enrichTripPlanWithWalking({itineraries:[trip(0)]},{onCandidateReady:callback});
  await jest.advanceTimersByTimeAsync(1000);await work;expect(callback).not.toHaveBeenCalled();
});
