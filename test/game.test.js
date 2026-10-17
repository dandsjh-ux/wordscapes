import test from 'node:test';
import assert from 'node:assert/strict';
import {GameEngine,ROUND_MS,normalise} from '../lib/game.js';
import {levels} from '../lib/levels.js';

function setup(){let time=1000;const engine=new GameEngine({now:()=>time});const {room,player:host}=engine.create('Teacher',true);const alice=engine.addPlayer(room,'Alice'),bob=engine.addPlayer(room,'Bob');engine.start(room,host);return {engine,room,host,alice,bob,advance:ms=>time+=ms};}
test('all 8 rounds contain 20 unique ranked targets, useful clues, and recognised tones',()=>{
  assert.equal(levels.length,8);
  for(const level of levels){
    assert.equal(level.words.length,20);const seen=new Set();
    level.words.forEach((w,i)=>{assert.equal(w.rank,i+1);assert.equal(w.points,100-i*5);assert.ok(w.hint.length>15);assert.ok(['positive','negative','neutral','mixed'].includes(w.tone));
      for(const alias of new Set([w.word,...w.aliases].map(normalise))){const n=normalise(alias);assert.ok(!seen.has(n),`${level.id}: duplicate ${n}`);seen.add(n);}
    });
    assert.equal(level.words.reduce((n,w)=>n+w.points,0),1050);assert.ok(level.focus&&level.model&&level.prompt);
  }
});
test('independent scoring, case-insensitivity, duplicate protection and spelling feedback',()=>{
  const {engine,room,alice,bob}=setup();
  assert.equal(engine.guess(room,alice,'  BARREN ').points,45);
  assert.equal(engine.guess(room,alice,'barren').status,'duplicate');assert.equal(alice.score,45);
  assert.equal(engine.guess(room,bob,'barren').points,45);assert.equal(bob.score,45);
  assert.equal(engine.guess(room,alice,'inhospitabla').status,'close');
  assert.equal(engine.guess(room,alice,'banana').status,'miss');assert.equal(alice.score,45);
  assert.throws(()=>engine.guess(room,alice,'<script>'),/English/);
});
test('unsolved answers and emotional labels stay private; each hint unlocks at its exact threshold',()=>{
  const {engine,room,alice,bob,advance}=setup();
  engine.guess(room,alice,'barren');
  const a=engine.view(room,alice),b=engine.view(room,bob);
  assert.equal(a.words[11].word,'barren');assert.equal(b.words[11].word,null);assert.equal(b.words[11].hint,null);assert.equal(b.words[11].tone,null);
  assert.ok(!JSON.stringify(b).includes('inhospitable'));assert.equal(b.learning,null);
  advance(29999);engine.tickRoom(room);assert.equal(room.stage,0);
  advance(1);engine.tickRoom(room);let view=engine.view(room,bob);assert.equal(view.stage,1);assert.ok(view.words[0].hint);assert.equal(view.words[0].word,null);assert.ok(!view.words[0].mask.includes('i'));
  advance(25000);engine.tickRoom(room);view=engine.view(room,bob);assert.equal(view.stage,2);assert.ok(view.words[0].mask.startsWith('i _'));
  advance(20000);engine.tickRoom(room);view=engine.view(room,bob);assert.equal(view.stage,3);assert.ok(view.words[0].mask.startsWith('i n _'));
  advance(15000);engine.tickRoom(room);view=engine.view(room,bob);assert.equal(view.phase,'review');assert.equal(view.words[0].word,'inhospitable');assert.ok(view.learning.model);assert.equal(view.history.length,1);
});
test('the server rejects a late guess even before the expiry tick runs',()=>{
  const {engine,room,alice,advance}=setup();advance(ROUND_MS);
  const result=engine.guess(room,alice,'dry');assert.equal(result.status,'closed');assert.equal(alice.score,0);assert.equal(room.phase,'review');
});
test('pause freezes both timer and clues; resume preserves the remaining 90-second budget',()=>{
  const {engine,room,host,alice,advance}=setup();advance(20_000);engine.pause(room,host);assert.equal(engine.remaining(room),70000);
  advance(120_000);engine.tickRoom(room);assert.equal(engine.remaining(room),70000);assert.equal(room.stage,0);assert.throws(()=>engine.guess(room,alice,'dry'),/paused/);
  engine.pause(room,host);advance(10000);engine.tickRoom(room);assert.equal(room.stage,1);assert.equal(engine.remaining(room),60000);assert.equal(engine.guess(room,alice,'dry').status,'hit');
});
test('teacher permissions and spectator mode are enforced on the server',()=>{
  const {engine,room,host,alice}=setup();assert.throws(()=>engine.pause(room,alice),/Only the host/);assert.throws(()=>engine.reveal(room,alice),/Only the host/);assert.throws(()=>engine.guess(room,host,'dry'),/spectator/);assert.throws(()=>engine.next(room,host),/Finish/);
});
test('a player can find all 160 words, including aliases, across eight complete rounds',()=>{
  const {engine,room,host,alice,advance}=setup();
  for(let round=0;round<8;round++){
    for(const word of levels[round].words){advance(600);assert.equal(engine.guess(room,alice,word.aliases[0]||word.word).status,'hit');}
    assert.equal(alice.roundScore,1050);assert.equal(alice.found.size,20);
    advance(ROUND_MS);engine.tickRoom(room);assert.equal(room.history.length,round+1);
    if(round<7)engine.next(room,host);
  }
  assert.equal(room.phase,'finished');assert.equal(alice.score,8400);assert.equal(engine.view(room,alice).history.length,8);
  assert.throws(()=>engine.next(room,host),/Finish/);
  engine.restart(room,host);assert.equal(room.phase,'lobby');assert.equal(alice.score,0);assert.equal(room.history.length,0);
});
test('score ties share rank; following players use competition ranking',()=>{
  const {engine,room,alice,bob}=setup();const charlie=engine.addPlayer(room,'Charlie');engine.guess(room,alice,'dry');engine.guess(room,bob,'dry');const rows=engine.view(room,charlie).players.filter(p=>!p.spectator);assert.deepEqual(rows.map(p=>p.rank),[1,1,3]);
});
test('guess rate limiting expires; malformed names and duplicate names are rejected',()=>{
  const {engine,room,alice,advance}=setup();for(let i=0;i<8;i++)engine.guess(room,alice,'banana');assert.throws(()=>engine.guess(room,alice,'dry'),/8 guesses/);advance(4000);assert.equal(engine.guess(room,alice,'dry').status,'hit');assert.throws(()=>engine.addPlayer(room,'alice'),/already/);assert.throws(()=>engine.addPlayer(room,' '),/2 characters/);
});
test('rejoin credentials preserve scores; host transfer waits 30 seconds and empty rooms expire',()=>{
  const {engine,room,host,alice,advance}=setup();engine.guess(room,alice,'dry');assert.equal(engine.resume(room.code,alice.token).player.score,5);assert.throws(()=>engine.resume(room.code,'wrong'),/expired/);
  host.connected=false;host.disconnectedAt=engine.now();advance(29999);engine.tickRoom(room);assert.equal(room.hostId,host.id);advance(1);engine.tickRoom(room);assert.equal(room.hostId,alice.id);
  for(const p of room.players.values())p.connected=false;engine.tickRoom(room);advance(15*60_000+1);engine.tickRoom(room);assert.equal(engine.rooms.size,0);
});
