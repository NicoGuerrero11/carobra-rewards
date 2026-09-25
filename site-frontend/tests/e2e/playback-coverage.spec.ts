import {test,expect} from '@playwright/test';
import {PlaybackCoverage,coveredSeconds} from '../../src/lib/playback-coverage';
test('coverage counts continuous playback, not seeks, pauses, buffering or replays',()=>{
  const coverage=new PlaybackCoverage();
  coverage.start(0,0);coverage.sample(1,1000);coverage.sample(2,2000);
  expect(coveredSeconds(coverage.ranges)).toBe(2);
  coverage.sample(590,3000);expect(coveredSeconds(coverage.ranges)).toBe(2);
  coverage.discontinuity();coverage.sample(595,4000);expect(coveredSeconds(coverage.ranges)).toBe(2);
  coverage.stop();coverage.sample(599,5000);expect(coveredSeconds(coverage.ranges)).toBe(2);
  coverage.start(0,6000);coverage.sample(1,7000);coverage.sample(2,8000);expect(coveredSeconds(coverage.ranges)).toBe(2);
  coverage.rate=2;coverage.sample(4,9000);expect(coveredSeconds(coverage.ranges)).toBe(4);
  coverage.sample(20,30000);expect(coveredSeconds(coverage.ranges)).toBe(4);
});
