import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreAttempt, clockParts, litWindows, bestAttempt, secondsLabel} from '../dist/game-core.js';

test('the target awards 1000 points and lights every window', () => {
  const result = scoreAttempt(10000);
  assert.equal(result.score, 1000);
  assert.equal(litWindows(result.deviation), 8);
  assert.deepEqual(clockParts(10000), {main:'18:00:00',ms:'.000'});
});
test('lighting uses inclusive deviation bands, independently of rounded scores', () => {
  for (const [ms, expected] of [[0,8],[50,8],[51,7],[100,7],[101,6],[200,6],[201,5],[350,5],[351,4],[500,4],[501,3],[750,3],[751,2],[1000,2],[1001,1],[1496,1],[2000,1],[2001,0]]) {
    assert.equal(litWindows(ms), expected, `${ms} ms`);
  }
  assert.equal(litWindows(scoreAttempt(11496).deviation),1,'reported 1.496-second result lights a window');
});
test('lower deviation never lights fewer windows; early and late stops are symmetric', () => {
  let previous = 8;
  for(let ms=0;ms<=3000;ms++){
    const lights=litWindows(ms); assert.ok(lights<=previous);previous=lights;
    assert.equal(litWindows(scoreAttempt(10000-ms).deviation),litWindows(scoreAttempt(10000+ms).deviation));
  }
  assert.equal(scoreAttempt(9750).score, 368);
  assert.equal(scoreAttempt(10250).score, 368);
});
test('expired and invalid results do not light windows', () => {
  assert.equal(scoreAttempt(13000).score, 0);
  assert.equal(litWindows(0,true),0);
  assert.equal(litWindows(-1),0);
  assert.equal(litWindows(NaN),0);
  assert.equal(litWindows(Infinity),0);
  assert.throws(() => scoreAttempt(NaN));
  assert.equal(secondsLabel(1496),'1,496');
});
test('ranking still excludes pending/rejected/expired results and breaks ties by time', () => {
  const winner = {deviation:10,achievedAt:100,status:'valid'};
  assert.equal(bestAttempt([
    {deviation:0,achievedAt:0,status:'suspicious'},
    {deviation:0,achievedAt:0,status:'rejected'},
    {deviation:0,achievedAt:0,timedOut:true},
    {deviation:10,achievedAt:200,status:'valid'}, winner
  ]), winner);
});
