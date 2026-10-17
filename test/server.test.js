import test from 'node:test';
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {createGameServer} from '../server.js';
import {GameEngine} from '../lib/game.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<150;i++){if(fn())return;await delay(10);}assert.fail('Timed out waiting for socket state');}
const request=(s,event,data={})=>s.timeout(2000).emitWithAck(event,data);
async function setup(t){let now=1000;const engine=new GameEngine({now:()=>now});const game=createGameServer({engine,autoTick:false});await new Promise(r=>game.httpServer.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${game.httpServer.address().port}`;const sockets=[];
  const connect=async(transports=['websocket'])=>{const socket=io(base,{transports,forceNew:true,reconnection:false});sockets.push(socket);socket.on('state',s=>socket.latest=s);socket.on('score',d=>{if(socket.latest){Object.assign(socket.latest.players.find(p=>p.id===d.id),d);}});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});return socket;};
  t.after(async()=>{sockets.forEach(s=>s.disconnect());await game.close();});return {game,base,connect,advance:ms=>now+=ms};
}
test('HTTP assets, local photographs and health check are served; answer bank is not public',async t=>{
  const {base}=await setup(t);assert.deepEqual(await(await fetch(`${base}/health`)).json(),{status:'ok'});
  const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/Wordscape Arena/);assert.ok(home.headers.get('content-security-policy'));
  for(const id of ['desert','forest','city','ruins','beach','mountains','coast','village']){const r=await fetch(`${base}/images/${id}.jpg`);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/jpeg/);assert.ok((await r.arrayBuffer()).byteLength>10000);}
  assert.equal((await fetch(`${base}/lib/levels.js`)).status,404);assert.equal((await fetch(`${base}/server.js`)).status,404);
  assert.equal((await(await fetch(`${base}/photo-credits.json`)).json()).length,8);
});
test('real Socket.IO clients complete 8 rounds with isolated rooms, private discoveries, live scores and resumption',async t=>{
  const {game,connect,advance}=await setup(t);const host=await connect();let alice=await connect();const bob=await connect(['polling']);
  const create=await request(host,'create',{name:'Teacher',spectator:true});assert.equal(create.ok,true);const code=create.code;
  const a=await request(alice,'join',{code:code.toLowerCase(),name:'Alice'});assert.equal(a.ok,true);assert.equal((await request(bob,'join',{code,name:'Bob'})).ok,true);
  assert.equal((await request(alice,'start')).ok,false);assert.equal((await request(host,'start')).ok,true);await until(()=>bob.latest?.phase==='playing');
  const other=await connect();const otherRoom=await request(other,'create',{name:'Other class'});assert.notEqual(otherRoom.code,code);assert.equal(other.latest.phase,'lobby');
  for(let round=1;round<=8;round++){
    await until(()=>alice.latest.round===round);
    const word=['dry','tall','dark','old','warm','high','wild','old'][round-1];
    const hit=await request(alice,'guess',{word});assert.equal(hit.status,'hit');await until(()=>bob.latest.players.find(p=>p.name==='Alice')?.roundScore===5);
    assert.equal(bob.latest.words[19].word,null);assert.equal((await request(bob,'guess',{word})).status,'hit');
    assert.equal((await request(alice,'guess',{word})).status,'duplicate');
    advance(30000);game.tick();await until(()=>bob.latest.stage===1);assert.equal(bob.latest.words[0].word,null);assert.ok(bob.latest.words[0].hint);
    advance(60000);game.tick();await until(()=>bob.latest.phase===(round===8?'finished':'review'));assert.ok(bob.latest.words.every(w=>w.word));
    if(round===1){alice.disconnect();await until(()=>host.latest.players.find(p=>p.name==='Alice')?.connected===false);alice=await connect();const result=await request(alice,'resume',{code,token:a.token});assert.equal(result.ok,true);assert.equal(result.state.me.score,5);}
    if(round<8)assert.equal((await request(host,'next')).ok,true);
  }
  assert.equal(bob.latest.history.length,8);const players=bob.latest.players.filter(p=>!p.spectator);assert.equal(players[0].score,40);assert.deepEqual(players.map(p=>p.rank),[1,1]);assert.equal(other.latest.phase,'lobby');
  assert.equal((await request(host,'restart')).ok,true);await until(()=>bob.latest.phase==='lobby');assert.equal(bob.latest.me.score,0);
});
test('refreshing a host restores controls, and a vacated lobby transfers hosting',async t=>{
  const {connect}=await setup(t);const host=await connect();const created=await request(host,'create',{name:'Host',spectator:true});const student=await connect();await request(student,'join',{code:created.code,name:'Student'});
  host.disconnect();const refreshed=await connect();const resumed=await request(refreshed,'resume',{code:created.code,token:created.token});assert.equal(resumed.state.me.host,true);await request(refreshed,'leave');await until(()=>student.latest.me.host);assert.equal((await request(student,'start')).ok,true);
});
test('one socket cannot create extra rooms or impersonate a player with an invalid token',async t=>{
  const {game,connect}=await setup(t);const s=await connect();const created=await request(s,'create',{name:'Alpha'});assert.equal((await request(s,'create',{name:'Again'})).ok,false);assert.equal(game.engine.rooms.size,1);
  const stranger=await connect();assert.equal((await request(stranger,'resume',{code:created.code,token:'made-up'})).ok,false);assert.equal((await request(stranger,'join',{code:created.code,name:'alpha'})).ok,false);
});
test('a classroom-sized room receives small score deltas without exposing other answer boards',async t=>{
  const {game,connect}=await setup(t);const host=await connect();const created=await request(host,'create',{name:'Teacher',spectator:true});
  const students=await Promise.all(Array.from({length:32},async(_,i)=>{const socket=await connect();assert.equal((await request(socket,'join',{code:created.code,name:`Student ${i+1}`})).ok,true);return socket;}));
  await request(host,'start');await until(()=>students.every(s=>s.latest?.phase==='playing'));
  let fullStates=0,deltaEvents=0;host.on('state',()=>fullStates++);host.on('score',()=>deltaEvents++);
  await Promise.all(students.map(s=>request(s,'guess',{word:'dry'})));await until(()=>deltaEvents===32);
  assert.equal(fullStates,0);assert.equal(host.latest.players.filter(p=>p.score===5).length,32);assert.ok(host.latest.words.every(w=>w.word===null));
  const room=game.engine.room(created.code);assert.equal(room.players.size,33);
});
