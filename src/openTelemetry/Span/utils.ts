import { HrTime } from './types';

export function createSpanException(err: Error, code?: string | number) {
  return {
    code: code === undefined || code === null ? '' : code,
    name: err.name,
    message: err.message,
    stack: err.stack || '',
  };
}

export function getHrTime(currentMs: number) {
  var time: HrTime = [0, 0];
  time[0] = Math.trunc(currentMs / 1000);
  time[1] = Number((currentMs / 1000 - time[0]).toFixed(9)) * 1000000000;
  return time;
}

export function diffHrTime(a: HrTime, b: HrTime) {
  return [a[0] - b[0], a[1] - b[1]] as HrTime;
}
