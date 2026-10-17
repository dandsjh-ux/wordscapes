import {randomBytes} from 'node:crypto';
import {levels} from './levels.js';

export const ROUND_MS = 90_000;
export const HINT_AT = [30_000, 55_000, 75_000];
export const normalise = text => typeof text === 'string' ? text.normalize('NFKC').toLowerCase().trim().replace(/[\s\-‐‑–—]+/g, '') : '';
const cleanName = name => typeof name === 'string' ? name.normalize('NFKC').replace(/[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,18) : '';
export class GameError extends Error {}
const check = (condition,message) => {if(!condition) throw new GameError(message);};
function oneEdit(a,b) {
  if(Math.abs(a.length-b.length)>1) return false;
  if(a.length===b.length) {
    const diff=[...a].map((x,i)=>x===b[i]?-1:i).filter(x=>x>=0);
    return diff.length===1 || (diff.length===2 && diff[1]===diff[0]+1 && a[diff[0]]===b[diff[1]] && a[diff[1]]===b[diff[0]]);
  }
  if(a.length>b.length) [a,b]=[b,a];
  for(let i=0;i<b.length;i++) if(a===b.slice(0,i)+b.slice(i+1)) return true;
  return false;
}

export class GameEngine {
  constructor({now=Date.now}={}) {this.rooms=new Map();this.now=now;}
  room(code) {
    check(typeof code==='string','Enter a room code.');
    const room=this.rooms.get(code.toUpperCase().trim());
    check(room,'Room not found. Check the code, or ask the host to create a new room.');
    return room;
  }
  create(name,spectator=false) {
    check(this.rooms.size<100,'The server has too many rooms. Please try later.');
    let code;do {code=Array.from(randomBytes(5),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%31]).join('');}while(this.rooms.has(code));
    const room={code,players:new Map(),hostId:null,phase:'lobby',round:-1,startedAt:0,pausedAt:null,pausedMs:0,stage:0,lastSecond:-1,createdAt:this.now(),touchedAt:this.now(),lastEmpty:null,history:[]};
    this.rooms.set(code,room);
    try {const player=this.addPlayer(room,name,spectator);room.hostId=player.id;return {room,player};}
    catch(e){this.rooms.delete(code);throw e;}
  }
  addPlayer(room,name,spectator=false) {
    name=cleanName(name);check(name.length>=2,'Use a name with at least 2 characters.');
    check(room.players.size<50,'This room already has 50 participants.');
    check(![...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()),'That name is already in the room. Add an initial or number.');
    const player={id:randomBytes(8).toString('hex'),token:randomBytes(24).toString('hex'),name,spectator:!!spectator,connected:true,socketId:null,disconnectedAt:null,score:0,roundScore:0,found:new Set(),attempts:[],rounds:[]};
    room.players.set(player.id,player);room.touchedAt=this.now();return player;
  }
  resume(code,token) {
    const room=this.room(code);
    check(typeof token==='string','Your rejoin key is missing.');
    const player=[...room.players.values()].find(p=>p.token===token);
    check(player,'Your seat has expired. Rejoin with your name.');
    return {room,player};
  }
  host(room,player) {check(room.hostId===player.id,'Only the host can do that.');}
  elapsed(room) {return room.round<0?0:Math.max(0,(room.pausedAt??this.now())-room.startedAt-room.pausedMs);}
  remaining(room) {return Math.max(0,ROUND_MS-this.elapsed(room));}
  start(room,player) {
    this.host(room,player);check(room.phase==='lobby','The game has already started.');
    check([...room.players.values()].some(p=>p.connected&&!p.spectator),'At least one player needs to join before starting.');
    this.beginRound(room,0);
  }
  beginRound(room,index) {
    room.phase='playing';room.round=index;room.startedAt=this.now();room.pausedAt=null;room.pausedMs=0;room.stage=0;room.lastSecond=-1;room.touchedAt=this.now();
    for(const p of room.players.values()){p.found=new Set();p.roundScore=0;p.attempts=[];}
  }
  next(room,player) {
    this.host(room,player);check(room.phase==='review','Finish the current round first.');
    check(room.round<levels.length-1,'This was the last round.');this.beginRound(room,room.round+1);
  }
  pause(room,player) {
    this.host(room,player);check(room.phase==='playing','There is no active round to pause.');
    if(room.pausedAt!==null){room.pausedMs+=this.now()-room.pausedAt;room.pausedAt=null;}
    else room.pausedAt=this.now();
  }
  finish(room) {
    if(room.phase!=='playing') return;
    room.phase=room.round===levels.length-1?'finished':'review';room.pausedAt=null;
    const results=[...room.players.values()].filter(p=>!p.spectator).map(p=>({id:p.id,name:p.name,score:p.roundScore,found:p.found.size}));
    room.history.push({round:room.round+1,title:levels[room.round].title,results});
    for(const p of room.players.values()) p.rounds[room.round]={score:p.roundScore,found:p.found.size};
    room.touchedAt=this.now();
  }
  reveal(room,player){this.host(room,player);check(room.phase==='playing','There is no active round.');this.finish(room);}
  restart(room,player) {
    this.host(room,player);check(room.phase==='finished','Complete all eight rounds before playing again.');
    room.phase='lobby';room.round=-1;room.history=[];room.pausedAt=null;
    for(const p of room.players.values()){p.score=0;p.roundScore=0;p.found=new Set();p.rounds=[];p.attempts=[];}
  }
  guess(room,player,raw) {
    check(!player.spectator,'You are hosting as a spectator.');
    check(room.phase==='playing','Wait for the next round.');
    // The authoritative deadline is checked on every guess, even between server ticks.
    if(this.remaining(room)<=0){this.finish(room);return {status:'closed',message:'Time’s up! Review the words.'};}
    check(room.pausedAt===null,'The host has paused the round.');
    check(typeof raw==='string' && raw.length<=50,'Enter one descriptor, up to 50 characters.');
    const guess=normalise(raw);check(guess.length>=2 && /^[a-z]+$/.test(guess),'Enter an English adjective or descriptive word.');
    const now=this.now();player.attempts=player.attempts.filter(t=>now-t<4000);
    check(player.attempts.length<8,'Take a moment — try a maximum of 8 guesses every 4 seconds.');player.attempts.push(now);
    const words=levels[room.round].words;
    const match=words.findIndex(w=>[w.word,...w.aliases].some(a=>normalise(a)===guess));
    if(match<0){
      const close=words.some((w,i)=>!player.found.has(i)&&w.word.length>=6&&[w.word,...w.aliases].some(a=>oneEdit(guess,normalise(a))));
      return {status:close?'close':'miss',message:close?'Close spelling! Check your letters and try again.':'Not one of these 20 targets. Other descriptions can still be valid.'};
    }
    if(player.found.has(match)) return {status:'duplicate',message:'You have already scored that word.'};
    const word=words[match];player.found.add(match);player.score+=word.points;player.roundScore+=word.points;room.touchedAt=now;
    return {status:'hit',word:word.word,points:word.points,tone:word.tone,message:`${word.word} · +${word.points} points`};
  }
  tickRoom(room) {
    let changed=false;
    if(room.phase==='playing') {
      const elapsed=this.elapsed(room);
      const stage=HINT_AT.filter(t=>elapsed>=t).length;
      if(stage!==room.stage){room.stage=stage;changed=true;}
      if(elapsed>=ROUND_MS){this.finish(room);changed=true;}
    }
    const host=room.players.get(room.hostId);
    if(host && !host.connected && host.disconnectedAt!==null && this.now()-host.disconnectedAt>=30000) {
      const next=[...room.players.values()].find(p=>p.connected);
      if(next){room.hostId=next.id;changed=true;}
    }
    const any=[...room.players.values()].some(p=>p.connected);
    if(any)room.lastEmpty=null;else room.lastEmpty??=this.now();
    // Idle lobbies expire; live class sessions can be left open for a whole lesson.
    if((room.lastEmpty!==null&&this.now()-room.lastEmpty>15*60_000)||this.now()-room.touchedAt>6*60*60_000){this.rooms.delete(room.code);return {removed:true,changed:false};}
    return {changed};
  }
  view(room,player) {
    const active=room.round>=0;
    const revealed=room.phase==='review'||room.phase==='finished';
    const level=active?levels[room.round]:null;
    const standings=[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,roundScore:p.roundScore,found:p.found.size,connected:p.connected,spectator:p.spectator,host:p.id===room.hostId})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
    let prior=null,rank=0;standings.forEach((p,i)=>{if(!p.spectator){if(p.score!==prior)rank=standings.slice(0,i).filter(x=>!x.spectator).length+1;p.rank=rank;prior=p.score;}});
    return {
      code:room.code,phase:room.phase,round:room.round+1,totalRounds:levels.length,serverNow:this.now(),remainingMs:room.phase==='playing'?this.remaining(room):0,paused:room.pausedAt!==null,stage:room.stage,
      me:{id:player.id,name:player.name,host:room.hostId===player.id,spectator:player.spectator,score:player.score,roundScore:player.roundScore,found:player.found.size},
      players:standings,
      level:level?{id:level.id,title:level.title,subtitle:level.subtitle,image:level.image,alt:level.alt}:null,
      words:level?level.words.map((w,i)=>{
        const found=player.found.has(i);
        return {rank:w.rank,points:w.points,found,
          word:found||revealed?w.word:null,
          hint:found||revealed||room.stage>=1?w.hint:null,
          tone:found||revealed?w.tone:null,
          // Never send full answers, aliases or hidden definitions to playing clients.
          mask:found||revealed?null:[...w.word].map((ch,j)=>ch==='-'?'–':room.stage>=2&&j===0?ch:room.stage>=3&&j===1?ch:'_').join(' ')
        };
      }):[],
      learning:revealed?{focus:level.focus,model:level.model,prompt:level.prompt}:null,
      history:revealed?room.history:[]
    };
  }
}
