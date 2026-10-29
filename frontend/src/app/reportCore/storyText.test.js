import {test} from 'node:test';import assert from 'node:assert/strict';import {decodeStoryBytes} from './storyText.js';
test('TXT requires valid UTF-8, 64KB and Unicode character limits',()=>{
 assert.equal(decodeStoryBytes(new TextEncoder().encode('\uFEFF故事\r\n记录')),'故事\n记录');
 assert.throws(()=>decodeStoryBytes(new Uint8Array([255])));
 assert.throws(()=>decodeStoryBytes(new Uint8Array(65537)),/64KB/);
 assert.throws(()=>decodeStoryBytes(new TextEncoder().encode('字'.repeat(20001))),/20000/);
 assert.equal([...decodeStoryBytes(new TextEncoder().encode('字'.repeat(20000)))].length,20000);
});
