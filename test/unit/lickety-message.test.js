'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {createLicketyMessenger}=require('../../src/lickety-message');
test('messages send only on explicit request, enforce 500 characters, and support retry without usage consent',async()=>{
 const sent=[];let fail=true;const messenger=createLicketyMessenger({version:'3.2.10.0',fetchImpl:async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return{ok:!fail};}});
 assert.equal((await messenger.send(' ')).ok,false);assert.equal((await messenger.send('x'.repeat(501))).ok,false);assert.equal(sent.length,0);
 assert.equal((await messenger.send('Please add this feature')).ok,false);fail=false;assert.equal((await messenger.send('Please add this feature')).ok,true);
 assert.deepEqual(sent[1].body,{message:'Please add this feature',version:'3.2.10.0'});assert.equal(sent[1].url,'https://selfserve.r46.me/api/lickety-message');
 assert.equal((await messenger.send('x'.repeat(500))).ok,true);
 const before=sent.length;
 for(const details of [{message:'Hello',email:'bad-email'},{message:'Hello',email:'a'.repeat(255)},{message:'Hello',name:'x'.repeat(81)},{message:'Hello',email:42}]) assert.equal((await messenger.send(details)).ok,false);
 assert.equal(sent.length,before);
 assert.equal((await messenger.send({message:' Hello ',name:' Babble Player ',email:' player@example.com '})).ok,true);
 assert.deepEqual(sent.at(-1).body,{message:'Hello',name:'Babble Player',email:'player@example.com',version:'3.2.10.0'});
});
