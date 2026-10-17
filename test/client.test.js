import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {createGameServer} from '../server.js';
import {GameEngine} from '../lib/game.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<300;i++){if(fn())return;await delay(10);}assert.fail('Timed out waiting for client DOM');}
const type=(window,id,value)=>{const el=window.document.getElementById(id);assert.ok(el,`Missing #${id}`);el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));};
const submit=(window,id)=>window.document.getElementById(id).dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
const click=(window,action)=>{const el=window.document.querySelector(`[data-action="${action}"]`);assert.ok(el,`Missing action ${action}`);el.click();};
test('two actual HTML clients create, join, guess, receive clues, pause, review, finish, export and replay',async t=>{
  let now=10000;const game=createGameServer({engine:new GameEngine({now:()=>now}),autoTick:false});await new Promise(r=>game.httpServer.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${game.httpServer.address().port}`;
  const pages=[],errors=[];t.after(async()=>{pages.forEach(p=>p.window.close());await game.close();});
  async function page(){const vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));const dom=await JSDOM.fromURL(base,{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(window){window.fetch=url=>fetch(new URL(url,base));window.scrollTo=()=>{};window.matchMedia=()=>({matches:true});window.confirm=()=>true;window.URL.createObjectURL=()=> 'blob:mock';window.URL.revokeObjectURL=()=>{};}});pages.push(dom);await until(()=>dom.window.document.getElementById('entry-form'));return dom.window;}
  const host=await page(),student=await page();await until(()=>game.io.engine.clientsCount===2);
  type(host,'player-name','Teacher Daniel');submit(host,'entry-form');await until(()=>host.document.querySelector('[data-action="start"]'));
  const room=[...game.engine.rooms.values()][0];assert.equal(room.players.size,1);assert.equal(room.players.values().next().value.spectator,true);
  click(student,'tab'); // First tab is Create; choose Join explicitly.
  student.document.querySelector('[data-tab="join"]').click();type(student,'player-name','Sunny');type(student,'room-code',room.code);submit(student,'entry-form');await until(()=>room.players.size===2);
  await until(()=>!host.document.querySelector('[data-action="start"]').disabled);click(host,'start');await until(()=>student.document.getElementById('guess-input'));
  assert.equal(student.document.querySelectorAll('.word-tile').length,20);assert.equal(student.document.getElementById('clock-time').textContent,'1:30');
  type(student,'guess-input','BARREN');submit(student,'guess-form');await until(()=>student.document.querySelector('.word-tile.found .answer')?.textContent==='barren');assert.equal(student.document.getElementById('guess-input').value,'');assert.equal(host.document.querySelector('.word-board .answer'),null);
  now+=30000;game.tick();await until(()=>student.document.querySelectorAll('.tile-hint').length===20);
  click(host,'pause');await until(()=>student.document.getElementById('guess-input').disabled);assert.match(student.document.getElementById('clock-label').textContent,/PAUSED/);
  now+=120000;game.tick();assert.equal(game.engine.remaining(room),60000);
  click(host,'pause');await until(()=>!student.document.getElementById('guess-input').disabled);
  now+=25000;game.tick();await until(()=>student.document.querySelector('.word-mask').textContent.startsWith('i _'));
  now+=35000;game.tick();await until(()=>student.document.querySelector('.review-words'));assert.equal(student.document.querySelectorAll('.review-words .answer').length,20);assert.match(student.document.querySelector('.learning-card').textContent,/connotation|atmosphere/i);
  for(let i=1;i<8;i++){click(host,'next');await until(()=>room.round===i);await until(()=>student.document.getElementById('guess-input'));now+=90000;game.tick();await until(()=>student.document.querySelector('.review-words'));}
  assert.match(student.document.querySelector('.winner h3').textContent,/Sunny/);assert.match(student.document.querySelector('.score-number').textContent,/45/);assert.equal(student.document.querySelectorAll('.history-table tbody tr').length,1);assert.ok(student.document.querySelector('[data-action="download"]'));
  // Intercept the download click to inspect the generated scores instead of navigating.
  let downloaded='';student.HTMLAnchorElement.prototype.click=function(){downloaded=this.download;};click(student,'download');assert.match(downloaded,/wordscape-.*-scores.csv/);
  click(host,'restart');await until(()=>student.document.querySelector('.lobby-layout'));assert.equal(room.players.get([...room.players.values()].find(p=>p.name==='Sunny').id).score,0);
  assert.deepEqual(errors,[]);
});
