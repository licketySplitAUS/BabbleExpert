'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {createLicketyMessenger}=require('../../src/lickety-message');
test('messages send only on explicit request, enforce 500 characters, and support retry without usage consent',async()=>{
 const sent=[];let fail=true;const messenger=createLicketyMessenger({version:'3.2.10.0',fetchImpl:async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return{ok:!fail};}});
 assert.equal((await messenger.send(' ')).ok,false);assert.equal((await messenger.send('x'.repeat(501))).ok,false);assert.equal(sent.length,0);
 assert.equal((await messenger.send('Please add this feature')).ok,false);fail=false;assert.equal((await messenger.send('Please add this feature')).ok,true);
 assert.deepEqual(sent[1].body,{message:'Please add this feature',version:'3.2.10.0'});assert.equal(sent[1].url,'https://selfserve.r46.me/api/lickety-message');
 assert.equal((await messenger.send('x'.repeat(500))).ok,true);
});
