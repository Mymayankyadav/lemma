import {expect,test} from 'vitest';
import {offlineReadyNotice,OFFLINE_READY_MESSAGE} from '../../../src/app/pwa-notice';

test('demo mode never shows a network-persistence warning',()=>{
 expect(offlineReadyNotice('demo')).toBeNull();
});
test('live mode retains the PWA offline-ready notice',()=>{
 expect(offlineReadyNotice('live')).toBe(OFFLINE_READY_MESSAGE);
});
