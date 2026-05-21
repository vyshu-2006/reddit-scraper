/* eslint-disable no-console */
import { Actor } from 'apify';

console.log('init start');
await Actor.init();
console.log('init done, input start');
await Actor.getInput();
console.log('input done, exit start');
await Actor.exit();
console.log('exit done');
