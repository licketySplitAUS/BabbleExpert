'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), assert = require('node:assert/strict');
for (const method of ['show', 'showInactive', 'focus', 'maximize']) BrowserWindow.prototype[method] = function () {};
app.disableHardwareAcceleration();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-word-recovery-'));
app.setPath('userData', dir);
app.on('web-contents-created', (_event, wc) => wc.setBackgroundThrottling(false));
const { createApp } = require('../../src/app');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i=0;i<200;i++) { if(await fn())return;await sleep(50); }throw Error('Recovery test timed out'); }
setTimeout(()=>app.exit(1),30000).unref();
app.whenReady().then(async()=>{
  const saved = new Set(['alpha']);
  let submissions=0, reads=0, loads=0, holdSavedLists=false;
  const pendingLists=[];
  const server=http.createServer(async(req,res)=>{
    if(req.url.startsWith('/action/get_word_list')) {
      reads++;res.setHeader('Content-Type','application/json');
      if(holdSavedLists) { pendingLists.push(res);return; }
      return res.end(JSON.stringify({words:[...saved].map(word=>[word,word.length,10])}));
    }
    if(req.url==='/add-word') {
      let word='';for await(const chunk of req)word+=chunk;
      submissions++;saved.add(word);res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify({message:'Last word added: '+word}));
    }
    res.setHeader('Content-Type','text/html');
    if(req.url.startsWith('/babble')) {
      loads++;
      let html=fs.readFileSync(path.join(__dirname,'fixtures/babble.html'),'utf8');
      html=html.replace('</script>',`
        window.puzzle_id='8097';window.documentMarker='same page';
        var glow;
        Object.defineProperty(window,'__babbleExpertGlow',{
          configurable:true,get:function(){return glow;},set:function(value){
            var remaining=value.setRemaining;
            value.setRemaining=function(words){window.receivedGlowWords=words;return remaining.call(this,words);};
            glow=value;
          }
        });
        window.AddWord=async function(word){
          var r=await fetch('/add-word',{method:'POST',body:word}),data=await r.json();
          if(window.failDisplay)throw Error('Display update failed after saving');
          return data.message;
        };
        window.AddToWordList=function(word){
          var row=document.querySelector('#word_list tbody').insertRow();
          var cell=row.insertCell();cell.className='word';cell.textContent=word;
        };
        window.UpdateWordListTotals=function(){window.totalsUpdated=true;};
        if(${holdSavedLists}) {
          document.querySelector('#word_list tbody').replaceChildren();
          document.body.insertAdjacentHTML('beforeend','<div id="word_list_loading">Loading saved words…</div>');
          window.GetWordList=function(){
            fetch('/action/get_word_list?puzzleid='+window.puzzle_id).then(r=>r.json()).then(data=>{
              data.words.forEach(row=>window.AddToWordList(row[0]));
              document.getElementById('word_list_loading').style.display='none';
            }).catch(()=>{});
          };
          window.GetWordList();
        }
      </script>`);
      return res.end(html);
    }
    res.end(fs.readFileSync(path.join(__dirname,'fixtures/clues.html')));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://localhost:'+server.address().port;
  const ctx=createApp({userDataDir:dir,tourPrompt:false,telemetryPrompt:false,telemetryEndpoint:null,
    urls:{babble:base+'/babble',clues:base+'/clues'},hosts:{babble:['localhost'],clues:['localhost']},tickMs:60000,pace:0});
  const inBabble=code=>ctx.views.babble.webContents.executeJavaScript(code);
  const inClues=code=>ctx.views.clues.webContents.executeJavaScript(code);
  try {
    await until(async()=>{await ctx.engine.tick();return ctx.engine.canSend;});
    await until(()=>inBabble('Array.isArray(window.receivedGlowWords)'));
    await inBabble(`document.forms.post_message.elements.add_message.value='unfinished chat';`);
    for(const [word,failDisplay] of [['bravo',false],['charlie',true]]) {
      await inBabble(`window.failDisplay=${failDisplay}`);
      await inClues(`ticked=[${JSON.stringify(word)}]`);
      assert.deepEqual(await ctx.engine.sendToBabble(),{sent:1,rejected:0,unconfirmed:0});
      assert.ok(await inBabble(`Array.prototype.some.call(document.querySelectorAll('#word_list td.word'),el=>el.textContent===${JSON.stringify(word)})`));
      assert.equal(await inBabble(`document.getElementById('total_words_left').textContent`), word === 'bravo' ? '3' : '2', 'Repair the remaining count as well as the displayed words');
    }
    assert.equal(submissions,2,'Recovery never resubmits either word');
    assert.equal(reads,2,'Only stale displays request the saved list');
    assert.equal(loads,1,'Recovery never reloads the Babble page');
    assert.equal(await inBabble('window.documentMarker'),'same page');
    assert.equal(await inBabble(`document.forms.post_message.elements.add_message.value`),'unfinished chat');
    assert.equal(await inBabble('window.totalsUpdated'),true);
    await inClues(`ticked=['delta']`);
    await ctx.engine.syncNativeWords();
    assert.ok(await inBabble(`Array.prototype.some.call(document.querySelectorAll('#word_list td.word'),el=>el.textContent==='delta')`));
    assert.equal(submissions,3,'Automatic reconciliation also recovers without duplicate submissions');
    await ctx.engine.tick();
    assert.equal(ctx.engine.state.remaining, '1');
    const progress = ctx.journal.view().records[0];
    assert.equal(progress.total, 6, 'Display recovery must not inflate the journal puzzle total');
    assert.equal(progress.found, 5);
    holdSavedLists=true;
    const priorSubmissions=submissions;
    for(let repeat=0;repeat<3;repeat++) {
      // Refresh again while the first saved-word request is still outstanding.
      for(let click=0;click<2;click++) {
        const before=reads;
        await ctx.refreshBabble();
        await until(()=>reads>before && !ctx.views.babble.webContents.isLoading());
        await ctx.engine.tick();await ctx.engine.syncNativeWords();
        assert.equal(ctx.engine.state.ready,false,'HTML loaded does not mean saved words have loaded');
        assert.equal(ctx.engine.state.babbleConnection,'loading');
        assert.equal(await inBabble(`document.forms.add_word.elements.word.value`),'','Loading must not fill the entry with already-saved words');
        assert.equal(submissions,priorSubmissions);
      }
      for(const response of pendingLists.splice(0))if(!response.destroyed)response.end(JSON.stringify({words:[...saved].map(word=>[word,word.length,10])}));
      await until(async()=>{await ctx.engine.tick();return ctx.engine.state.ready;});
      await until(()=>inBabble('Array.isArray(window.receivedGlowWords)'));
      await ctx.engine.syncNativeWords();
      assert.equal(submissions,priorSubmissions,'Repeated refreshes do not resubmit saved words');
      assert.equal(await inBabble(`document.forms.add_word.elements.word.value`),'');
    }
    console.log('PASS: saved words missing from the display recover after success or callback failure; bulk and automatic sync preserve the page and chat draft without resubmission');
    console.log('PASS: repeated refreshes wait for delayed saved-word lists and neither resubmit nor visibly re-enter existing words');
    console.log('PASS: recovered word counts keep journal totals consistent, and refresh restores remaining-word grid hints');
    server.close();app.exit(0);
  }catch(error){console.error(error);server.close();app.exit(1);}
}).catch(error=>{console.error(error);app.exit(1);});
