import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {fileURLToPath} from 'node:url';
import {GameEngine,GameError} from './lib/game.js';

export function createGameServer({engine=new GameEngine(),autoTick=true}={}) {
  const app=express();app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
    next();
  });
  app.get('/health',(_req,res)=>res.json({status:'ok'}));
  app.use(express.static(fileURLToPath(new URL('./public',import.meta.url)),{maxAge:'1h',index:'index.html'}));
  const httpServer=createServer(app);
  const io=new Server(httpServer,{maxHttpBufferSize:8192,pingInterval:25000,pingTimeout:20000,serveClient:true});
  const connections=new Map();
  function broadcast(room) {
    for(const p of room.players.values())if(p.connected&&p.socketId)io.to(p.socketId).emit('state',engine.view(room,p));
  }
  function tick(){
    for(const room of engine.rooms.values()) {
      const {changed,removed}=engine.tickRoom(room);
      if(removed){io.to(room.code).emit('roomExpired');io.in(room.code).disconnectSockets(true);continue;}
      if(changed)broadcast(room);
      if(room.phase==='playing'){
        const second=Math.ceil(engine.remaining(room)/1000);
        if(second!==room.lastSecond){room.lastSecond=second;io.to(room.code).emit('clock',{remainingMs:engine.remaining(room),paused:room.pausedAt!==null,serverNow:engine.now()});}
      }
    }
  }
  const interval=autoTick?setInterval(tick,250):null;interval?.unref();
  io.on('connection',socket=>{
    let operations=[];
    const action=(event,handler)=>socket.on(event,(data,ack)=>{
      if(typeof ack!=='function')return;
      try{
        const now=engine.now();operations=operations.filter(t=>now-t<10000);
        if(operations.length>=50)throw new GameError('Too many requests. Wait a few seconds.');operations.push(now);
        const result=handler(data??{});ack({ok:true,...result});
      }catch(error){if(!(error instanceof GameError))console.error(error);ack({ok:false,error:error instanceof GameError?error.message:'Something went wrong. Please try again.'});}
    });
    function bind(room,player){
      if(connections.has(socket.id))throw new GameError('You are already in a room. Leave it first.');
      if(player.socketId&&player.socketId!==socket.id){const old=io.sockets.sockets.get(player.socketId);old?.emit('replaced');old?.disconnect(true);}
      if(!room.hostId||!room.players.has(room.hostId))room.hostId=player.id;
      player.socketId=socket.id;player.connected=true;player.disconnectedAt=null;room.touchedAt=engine.now();room.lastEmpty=null;
      connections.set(socket.id,{room,player});socket.join(room.code);broadcast(room);
      return {code:room.code,token:player.token,state:engine.view(room,player)};
    }
    const current=()=>{const c=connections.get(socket.id);if(!c)throw new GameError('Join a room first.');return c;};
    const ensureFree=()=>{if(connections.has(socket.id))throw new GameError('You are already in a room.');};
    action('create',data=>{ensureFree();const {room,player}=engine.create(data.name,data.spectator===true);return bind(room,player);});
    action('join',data=>{ensureFree();const room=engine.room(data.code);const player=engine.addPlayer(room,data.name);return bind(room,player);});
    action('resume',data=>{ensureFree();const {room,player}=engine.resume(data.code,data.token);return bind(room,player);});
    for(const event of ['start','next','pause','reveal','restart'])action(event,()=>{const {room,player}=current();engine[event](room,player);broadcast(room);return {};});
    action('guess',data=>{const {room,player}=current();const result=engine.guess(room,player,data.word);if(result.status==='hit'){socket.emit('state',engine.view(room,player));socket.to(room.code).emit('score',{id:player.id,score:player.score,roundScore:player.roundScore,found:player.found.size});}else if(result.status==='closed')broadcast(room);return result;});
    action('sync',()=>{const {room,player}=current();return {state:engine.view(room,player)};});
    action('leave',()=>{
      const {room,player}=current();connections.delete(socket.id);socket.leave(room.code);player.connected=false;player.socketId=null;player.disconnectedAt=engine.now()-30000;
      // Keep scores in a started game; free a lobby seat immediately.
      if(room.phase==='lobby'){room.players.delete(player.id);if(room.hostId===player.id)room.hostId=[...room.players.values()].find(p=>p.connected)?.id??null;}
      engine.tickRoom(room);broadcast(room);return {};
    });
    socket.on('disconnect',()=>{
      const c=connections.get(socket.id);connections.delete(socket.id);
      if(!c||c.player.socketId!==socket.id)return;
      c.player.connected=false;c.player.socketId=null;c.player.disconnectedAt=engine.now();broadcast(c.room);
    });
  });
  return {app,httpServer,io,engine,tick,broadcast,async close(){if(interval)clearInterval(interval);await new Promise(resolve=>io.close(resolve));}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const game=createGameServer();
  const port=Number(process.env.PORT)||3000;
  game.httpServer.listen(port,'0.0.0.0',()=>console.log(`Wordscape Arena is listening on http://localhost:${port}`));
  const shutdown=()=>{game.close().then(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();};
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
