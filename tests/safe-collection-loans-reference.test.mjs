// Abstract ownership oracle; not a compiler or runtime conformance test.
import assert from 'node:assert/strict';
import test from 'node:test';
function root(){return {readers:0,writer:false,live:true};}
function read(s,i,len){if(!s.live||s.writer)throw Error('loan');if(i<0||i>=len)return {tag:'None'};s.readers++;return {tag:'Some',root:s};}
function write(s,mutable){if(!mutable||!s.live||s.readers||s.writer)throw Error('loan');s.writer=true;}
function retire(s){if(s.readers||s.writer)throw Error('loan');s.live=false;}
test('read loan bounds do not create loans',()=>{const s=root();assert.equal(read(s,-1,2).tag,'None');assert.equal(read(s,2,2).tag,'None');assert.equal(s.readers,0);});
test('multiple reads exclude write and retirement',()=>{const s=root();assert.equal(read(s,0,2).root,s);assert.equal(read(s,1,2).root,s);assert.throws(()=>write(s,true));assert.throws(()=>retire(s));s.readers-=2;write(s,true);assert.throws(()=>read(s,0,2));s.writer=false;retire(s);assert.throws(()=>read(s,0,2));});
test('persistent collections deny write loans even with no readers',()=>assert.throws(()=>write(root(),false)));
test('nested Some(None) is not absent',()=>assert.notDeepEqual({tag:'Some',value:{tag:'None'}},{tag:'None'}));
