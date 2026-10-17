/* Wordscape Arena: same-origin Socket.IO client. Target answers are never bundled here. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const app=$('app'), status=$('connection');
  const escape = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const places=[['desert','Sea of Sand'],['forest','Into the Mist'],['city','Neon After Hours'],['ruins','The Locked Door'],['beach','A World Away'],['mountains','Above the World'],['coast','At the Edge'],['village','The Quiet Lane']];
  const params=new URLSearchParams(location.search);
  let entryMode=params.has('room')?'join':'host', entryName='', codeInput=(params.get('room')||'').replace(/[^a-z0-9]/gi,'').slice(0,5).toUpperCase();
  let state=null, draft='', feedback={message:'Try a precise adjective. Every target is yours to discover.',status:''}, credits=[], connected=false, busy=false, sound=false, audio=null, lateJoin=false;
  let clock={remainingMs:90000,at:Date.now(),paused:false};
  let saved=null;
  try {saved=JSON.parse(sessionStorage.getItem('wordscape-seat')||'null');}catch{}
  const storeSeat = value => {saved=value;try{if(value)sessionStorage.setItem('wordscape-seat',JSON.stringify(value));else sessionStorage.removeItem('wordscape-seat');}catch{}};
  const toast=(message,type='')=>{
    const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;$('toast-region').append(el);
    setTimeout(()=>el.remove(),3600);
  };
  const beep=hit=>{
    if(!sound)return;
    try{
      audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();
      const now=audio.currentTime;
      [hit?523:330,hit?784:262].forEach((frequency,i)=>{const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(.0001,now+i*.08);gain.gain.exponentialRampToValueAtTime(.08,now+i*.08+.01);gain.gain.exponentialRampToValueAtTime(.0001,now+i*.08+.15);osc.connect(gain);gain.connect(audio.destination);osc.start(now+i*.08);osc.stop(now+i*.08+.16);});
    }catch{}
  };
  function openDialog(id){const el=$(id);if(typeof el.showModal==='function')el.showModal();else el.setAttribute('open','');}
  function closeDialog(id){const el=$(id);if(typeof el.close==='function')el.close();else el.removeAttribute('open');}
  document.addEventListener('click',event=>{const close=event.target.closest('[data-close]');if(close)closeDialog(close.dataset.close);});
  for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  $('help-button').addEventListener('click',()=>openDialog('help-dialog'));
  $('sound-button').addEventListener('click',()=>{sound=!sound;$('sound-button').setAttribute('aria-pressed',String(sound));$('sound-button').setAttribute('aria-label',`Turn sound ${sound?'off':'on'}`);$('sound-button').title=`Turn sound ${sound?'off':'on'}`;toast(`Sound ${sound?'on':'off'}`);beep(true);});
  fetch('/photo-credits.json').then(r=>r.json()).then(data=>{credits=data;renderCredits();if(state)render();}).catch(()=>{$('credits-content').textContent='Photo sources are listed in the CREDITS.md file included with this game.';});
  $('credits-button').addEventListener('click',()=>openDialog('credits-dialog'));
  function renderCredits(){
    $('credits-content').innerHTML=credits.map(c=>`<div class="credit-row"><img src="${escape(c.image)}" alt="${escape(c.id)}"><span>${escape(places.find(p=>p[0]===c.id)?.[1]||c.id)}<a href="${escape(c.source)}" target="_blank" rel="noopener noreferrer">${escape(c.author)} / Unsplash ↗</a></span></div>`).join('');
  }
  function entryForm(){return `
    <div class="tabs" role="group" aria-label="Enter game"><button class="${entryMode==='host'?'active':''}" data-action="tab" data-tab="host" aria-pressed="${entryMode==='host'}">Create a room</button><button class="${entryMode==='join'?'active':''}" data-action="tab" data-tab="join" aria-pressed="${entryMode==='join'}">Join a room</button></div>
    <form id="entry-form" data-mode="${entryMode}">
      <label class="field" for="player-name">${entryMode==='host'?'Host name':'Your player name'}</label>
      <input class="field-input" id="player-name" name="name" minlength="2" maxlength="18" placeholder="${entryMode==='host'?'e.g. Teacher Daniel':'e.g. Alex'}" value="${escape(entryName)}" autocomplete="nickname" required>
      ${entryMode==='join'?`<label class="field" for="room-code">Room code</label><input class="field-input code-input" id="room-code" name="code" placeholder="ABCDE" maxlength="5" minlength="5" value="${escape(codeInput)}" autocomplete="off" autocapitalize="characters" spellcheck="false" required>`:`<label class="check-label"><input type="checkbox" name="spectator" checked> I’m hosting only (no score)</label>`}
      <p id="entry-error" class="form-error" role="alert"></p>
      <button class="button primary full" type="submit" ${busy?'disabled':''}>${busy?'Connecting…':entryMode==='host'?'Create game':'Enter the arena'} <span aria-hidden="true">→</span></button>
    </form>
    <div class="or-divider">WARM UP FIRST</div><button class="text-button solo-button" data-action="solo">Try a solo expedition ↗</button>`;}
  function home(){
    app.innerHTML=`<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="live-dot"></span> A LIVE MULTIPLAYER WORD EXPEDITION</p><h1>One photo.<br>Find the <em>feeling.</em></h1><p class="intro">A quiet forest or an eerie one? Explore eight places, find the words hiding in plain sight, and turn what you see into something you feel.</p><div class="stat-row"><div class="stat"><b>08</b>PHOTO ROUNDS</div><div class="stat"><b>90s</b>PER ROUND</div><div class="stat"><b>160</b>WORDS TO FIND</div></div></div><div class="entry-card"><h3>Your next great word awaits.</h3><p>Gather your class. Bring your imagination.</p>${entryForm()}</div></section>
      <section class="expedition-banner" aria-label="Preview the expedition">${[['desert','01 / THE OPEN WILDERNESS','Beyond the obvious.'],['forest','02 / THE HIDDEN ATMOSPHERE','Choose your mood.'],['city','03 / THE RESTLESS CITY','Catch the energy.']].map(([id,eyebrow,title])=>`<div class="scene"><img src="/images/${id}.jpg" alt="${escape(places.find(p=>p[0]===id)[1])}"><div class="scene-label"><span>${eyebrow}</span><b>${title}</b></div></div>`).join('')}</section>
      <section><div class="section-line"><p class="eyebrow">YOUR EIGHT-STOP EXPEDITION</p><p class="small">From first impressions to powerful connotations.</p></div><div class="journey">${places.map(([id,title],i)=>`<div class="journey-card"><img src="/images/${id}.jpg" alt="${escape(title)}" loading="lazy"><span><small>0${i+1}</small>${escape(title)}</span></div>`).join('')}</div></section>
      <div class="bottom-note"><div><b>More precision. More points.</b>Twenty ranked targets per scene. Each player gets their own discoveries.</div><div><b>A little help along the way.</b>Meaning clues, then starting letters, unlock as the clock counts down.</div><div><b>Learn the feeling behind the word.</b>Review meanings and connotations together after every round.</div></div>`;
  }
  function roomLine(){return `<div class="room-line"><div class="room-meta"><span class="small muted">ROOM</span><button class="room-code" data-action="copy" title="Copy invite link">${escape(state.code)} ↗</button><span class="tag ${state.me.host?'orange-tag':''}">${state.me.host?'YOU’RE HOSTING':'IN THE ARENA'}</span></div><div class="room-meta">${state.phase!=='lobby'?`<div class="level-progress" aria-label="Round ${state.round} of 8">${places.map((_,i)=>`<i class="${i<state.round-1?'done':i===state.round-1?'current':''}"></i>`).join('')}</div>`:''}<button class="text-button" data-action="leave">Leave room ↗</button></div></div>`;}
  function roster(){return `<div class="roster">${state.players.map(p=>`<div class="roster-chip ${p.connected?'':'offline'}"><span class="avatar">${escape(p.name[0].toUpperCase())}</span><span><b>${escape(p.name)}${p.id===state.me.id?' · you':''}</b><small>${p.host?'HOST · ':''}${p.spectator?'SPECTATOR':p.connected?'READY':'RECONNECTING'}</small></span></div>`).join('')}</div>`;}
  function lobby(){
    const players=state.players.filter(p=>!p.spectator&&p.connected);
    return `${roomLine()}<section class="lobby-layout"><div class="lobby-hero"><img src="/images/forest.jpg" alt="A mist-filled forest"><div><span class="eyebrow">THE EXPEDITION STARTS HERE</span><h2>Big ideas.<br>Even better words.</h2><p>Share this code with your class. Everyone opens this website on their own device and joins the same room.</p><strong class="big-code">${escape(state.code)}</strong><button class="button lime" data-action="copy">Copy invite link ↗</button></div></div><div class="lobby-side"><section class="panel"><div class="section-line"><h3>In the arena</h3><span class="tag">${players.length} PLAYER${players.length===1?'':'S'}</span></div>${roster()}${state.me.host?`<div class="host-controls"><button class="button primary full" data-action="start" ${players.length?'':'disabled'}>Start the expedition →</button></div><p class="small muted lobby-tip">${players.length?'Each photo runs for 90 seconds. You control when the next round begins.':'Waiting for a player to join. To play alone, leave and choose the solo expedition.'}</p>`:`<p class="small muted lobby-tip">The host will start when everyone is ready. Your discoveries stay private; the leaderboard tracks scores live.</p>`}</section><section class="panel"><p class="eyebrow">A FIELD NOTE</p><h3 class="tip-title">Same place. Different feeling.</h3><p class="small muted tip-copy">A word can describe what is there and suggest how we should feel about it. Look for atmosphere as well as physical detail.</p><button class="text-button" data-action="help">Read the field guide ↗</button></section></div></section>`;
  }
  function scoreboard(){
    const rows=state.players.filter(p=>!p.spectator);
    return `<section class="panel scoreboard"><p class="eyebrow">THE LEADERBOARD</p><h3>${state.phase==='finished'?'Final standings':'Word on the street'}</h3><div class="score-scroll"><table class="score-table"><thead><tr><th>PLAYER</th><th>ROUND</th><th>TOTAL</th></tr></thead><tbody>${rows.map(p=>`<tr class="${p.id===state.me.id?'me-row':''} ${p.connected?'':'offline'}"><td><span class="player-name"><span class="rank">${p.rank}</span>${escape(p.name)}${p.id===state.me.id?' · you':''}<small>${p.connected?'':'Offline · '}${p.found}/20 found</small></span></td><td><span class="round-points">+${p.roundScore}</span></td><td class="score-number">${p.score.toLocaleString()}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<p class="empty-state">Waiting for players.</p>'}</div>${!state.me.spectator?`<div class="your-stats"><span>YOUR ROUND<b>${state.me.roundScore}</b></span><span>WORDS FOUND<b>${state.me.found}<span> / 20</span></b></span></div>`:'<p class="small muted lobby-tip">You’re watching as a spectator.</p>'}</section>`;
  }
  function hostPanel(){return state.me.host?`<section class="host-panel"><p class="eyebrow">HOST CONTROLS</p><div class="host-controls">${state.phase==='playing'?`<button class="button secondary" data-action="pause">${state.paused?'Resume timer ▷':'Pause timer Ⅱ'}</button><button class="button secondary" data-action="reveal">End round ↗</button>`:state.phase==='review'?'<button class="button primary full" data-action="next">Next photo →</button>':state.phase==='finished'?'<button class="button primary full" data-action="restart">Play again ↻</button>':''}</div><p class="small muted">${state.phase==='playing'?'Pause for discussion. Ending early reveals the answers to everyone.':'Take a moment to explore the word choices before moving on.'}</p></section>`:`<section class="host-panel"><p class="eyebrow">EXPEDITION STATUS</p><p class="small muted">${state.phase==='playing'?'The host can pause the clock. Your discoveries stay private until the review.':state.phase==='finished'?'The expedition is complete. The host can start a new game.':'Waiting for the host to start the next photo.'}</p></section>`;}
  function wordTiles(review=false){return state.words.map(w=>`<article class="word-tile ${w.found?'found':''}" aria-label="Rank ${w.rank}, ${w.points} points${w.found?', found':''}"><div class="tile-meta"><span>#${String(w.rank).padStart(2,'0')} ${w.found?'✓':''}</span><strong>${w.points} PTS</strong></div>${w.word?`<span class="answer">${escape(w.word)}</span><span class="tone ${escape(w.tone)}">${escape(w.tone)}</span>`:`<p class="word-mask">${escape(w.mask)}</p>`}${w.hint?`<p class="tile-hint">${escape(w.hint)}</p>`:''}</article>`).join('');}
  function credit(){const c=credits.find(c=>c.id===state.level.id);return c?`Photo: <a href="${escape(c.source)}" target="_blank" rel="noopener noreferrer">${escape(c.author)} / Unsplash ↗</a>`:'Photo: Unsplash · see credits';}
  function playing(){return `${roomLine()}<div class="round-heading"><div><p class="eyebrow">ROUND ${String(state.round).padStart(2,'0')} / 08 · THE PHOTO CHALLENGE</p><h2>${escape(state.level.title)}</h2><p>${escape(state.level.subtitle)}</p></div><div class="clock" id="clock"><span id="clock-time">1:30</span><small id="clock-label">TIME TO EXPLORE</small></div></div>${state.paused?'<div class="pause-banner">Ⅱ The host has paused the expedition. Take a closer look.</div>':''}${lateJoin?'<p class="late-note">You joined during the expedition. You can score from this round onwards.</p>':''}<div class="play-layout"><div><div class="visual-and-words"><div class="photo-column"><figure class="photo-card"><div class="photo-wrap"><img src="${escape(state.level.image)}" alt="${escape(state.level.alt)}" fetchpriority="high"></div><figcaption class="photo-label"><b>0${state.round}</b><span>LOOK AT THE PLACE.<br>THINK ABOUT THE FEELING.</span><button class="text-button" data-action="zoom">Enlarge ↗</button></figcaption><div class="photo-credit">${credit()}</div></figure><p class="lens-note"><b>THE WRITER’S LENS</b>Look at colour, texture, light and space. Then think about the atmosphere they could create.</p></div><section><div class="board-title"><span>${state.me.spectator?'20 HIDDEN DESCRIPTORS':'YOUR WORDS TO DISCOVER'}</span><span>${state.me.found} / 20 found</span></div><div class="word-board" id="word-board">${wordTiles()}</div><p class="hint-status"><b>✧</b><span id="hint-message">Meaning clues unlock at 1:00 remaining.</span></p></section></div>${state.me.spectator?'<p class="spectator-note">You’re hosting as a spectator. Let the class look, think and guess. All words and meanings appear when the round ends.</p>':`<div class="guess-box"><div class="guess-top"><b>WHAT WORD FITS THE SCENE?</b><span>ONE WORD · PRESS ENTER</span></div><form class="guess-form" id="guess-form"><label for="guess-input" hidden>Your descriptor</label><input id="guess-input" placeholder="Type a descriptive word…" value="${escape(draft)}" maxlength="50" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" ${state.paused||!connected?'disabled':''}><button type="submit" class="button lime" ${state.paused||!connected?'disabled':''}>Guess ↗</button></form><p class="guess-feedback ${escape(feedback.status)}" id="guess-feedback" aria-live="polite">${escape(feedback.message)}</p></div>`}</div><aside class="side-stack">${scoreboard()}${hostPanel()}<p class="small muted">100 → 5 points per target.<br>Each word scores once for each player.<br>Hints do not reduce points.</p></aside></div>`;}
  function historyTable(){
    return `<div class="history-table"><table><thead><tr><th>PLAYER</th>${places.map((_,i)=>`<th>R${i+1}</th>`).join('')}<th>TOTAL</th></tr></thead><tbody>${state.players.filter(p=>!p.spectator).map(p=>`<tr><td>${escape(p.name)}</td>${places.map((_,i)=>`<td>${state.history.find(h=>h.round===i+1)?.results.find(r=>r.id===p.id)?.score??'–'}</td>`).join('')}<td><b>${p.score}</b></td></tr>`).join('')}</tbody></table></div>`;
  }
  function review(){
    const final=state.phase==='finished', players=state.players.filter(p=>!p.spectator), winners=players.filter(p=>p.rank===1), winnerNames=winners.map(p=>p.name).join(' & ');
    return `${roomLine()}<section class="review-banner"><div><p class="eyebrow">${final?'THE EXPEDITION IS COMPLETE':`ROUND ${String(state.round).padStart(2,'0')} COMPLETE`}</p><h2>${final?'Eight places. A world of words.':'A closer look at your word choices.'}</h2><p>${state.me.spectator?'Explore the meanings, compare the moods, and celebrate the discoveries.':`You found ${state.me.found} of 20 words and earned ${state.me.roundScore} points this round.`}</p></div>${!final&&state.me.host?'<button class="button lime" data-action="next">Next photo →</button>':!final?'<span class="tag">WAITING FOR THE HOST</span>':''}</section><div class="review-layout"><div><div class="section-line"><h3>The words behind the scene</h3><span class="tag">${escape(state.level.title)}</span></div><div class="legend"><span>Possible connotations:</span><span class="tone positive">positive</span><span class="tone negative">negative</span><span class="tone neutral">neutral</span><span class="tone mixed">mixed</span><span>✓ green cards = your discoveries</span></div><div class="review-words">${wordTiles(true)}</div><section class="learning-card"><div><p class="eyebrow">THE CONNOTATION CONNECTION</p><h3>What does the word suggest?</h3><p>${escape(state.learning.focus)}</p><div class="discussion"><b>TALK IT THROUGH</b><p>${escape(state.learning.prompt)}</p></div></div><div><p class="eyebrow">BRING THE SCENE TO LIFE</p><h3>One way to write it</h3><p class="model-sentence">“${escape(state.learning.model)}”</p><p class="small muted tip-copy">A photograph supports several readings. These 20 targets are a starting point; other well-supported descriptions can work too.</p></div></section>${final?`${historyTable()}<div class="final-actions"><button class="button secondary" data-action="download">Download scores (CSV) ↓</button>${state.me.host?'<button class="button primary" data-action="restart">Play again ↻</button>':''}</div>`:''}</div><aside class="side-stack">${final&&winners.length?`<section class="winner"><span class="eyebrow">${winners.length>1?'YOUR JOINT CHAMPIONS':'YOUR WORDSCAPE CHAMPION'}</span><div class="trophy" aria-hidden="true">✦</div><h3>${escape(winnerNames)}</h3><p>${winners[0].score.toLocaleString()} points · ${winners.length>1?'A shared victory.':'A way with words.'}</p></section>`:''}${scoreboard()}${hostPanel()}<div class="review-photo"><img src="${escape(state.level.image)}" alt="${escape(state.level.alt)}"><p>${credit()}</p><button class="text-button" data-action="zoom">Revisit the photo ↗</button></div></aside></div>`;
  }
  function render(){
    const focused=document.activeElement?.id,sel=focused==='guess-input'?[$('guess-input').selectionStart,$('guess-input').selectionEnd]:null;
    const boardScroll=$('word-board')?.scrollTop||0;
    if(!state){home();return;}
    app.innerHTML=state.phase==='lobby'?lobby():state.phase==='playing'?playing():review();
    if($('word-board'))$('word-board').scrollTop=boardScroll;
    if(focused==='guess-input'&&$('guess-input')&&!$('guess-input').disabled){$('guess-input').focus({preventScroll:true});if(sel)try{$('guess-input').setSelectionRange(...sel);}catch{}}
    updateClock();
  }
  function updateClock(){
    if(!state||state.phase!=='playing'||!$('clock-time'))return;
    const ms=Math.max(0,clock.remainingMs-(clock.paused?0:Date.now()-clock.at));const sec=Math.ceil(ms/1000);
    $('clock-time').textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
    $('clock-label').textContent=clock.paused?'EXPEDITION PAUSED':sec===0?'ROUND COMPLETE':sec<=15?'MAKE IT COUNT':'TIME TO EXPLORE';
    $('clock').classList.toggle('urgent',sec<=15&&!clock.paused);$('clock').classList.toggle('is-paused',clock.paused);
    const text=state.stage===0?`Meaning clues unlock in ${Math.max(0,sec-60)}s.`:state.stage===1?`Meaning clues are live. First letters in ${Math.max(0,sec-35)}s.`:state.stage===2?`First letters are live. Second letters in ${Math.max(0,sec-15)}s.`:'All clues are live. Make these last seconds count!';
    if($('hint-message'))$('hint-message').textContent=clock.paused?'Clues and clock are paused.':text;
  }
  function applyState(next){
    const previous=state;state=next;clock={remainingMs:state.remainingMs,at:Date.now(),paused:state.paused};
    if(previous?.round!==state.round){draft='';feedback={status:'',message:'Try a precise adjective. Every target is yours to discover.'};if(state.round>1)lateJoin=false;}
    if(previous?.me.host===false&&state.me.host)toast('You are now the host. The controls are yours.');
    render();
    if(previous?.phase!==state.phase){window.scrollTo?.({top:0,behavior:'instant'});if(state.phase==='finished'){beep(true);confetti();}}
  }
  function confetti(){
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const el=document.createElement('div');el.className='confetti';el.setAttribute('aria-hidden','true');
    for(let i=0;i<45;i++){const p=document.createElement('i');p.style.left=`${i*2.2}%`;p.style.animationDelay=`${(i%8)*.13}s`;el.append(p);}document.body.append(el);setTimeout(()=>el.remove(),4500);
  }
  function zoom(){let dialog=$('photo-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='photo-dialog';dialog.className='photo-dialog';dialog.setAttribute('aria-label','Enlarged place photograph');document.body.append(dialog);}dialog.innerHTML=`<div class="dialog-top"><p class="eyebrow">${escape(state.level.title)}</p><button class="icon-button" data-close="photo-dialog" aria-label="Close enlarged photo">×</button></div><img src="${escape(state.level.image)}" alt="${escape(state.level.alt)}">`;openDialog('photo-dialog');}
  function downloadScores(){
    // Prevent spreadsheet formula interpretation of user-chosen names.
    const cell=v=>`"${String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')}"`;
    const rows=[['Rank','Player',...places.map((p,i)=>`Round ${i+1}: ${p[1]}`),'Total'],...state.players.filter(p=>!p.spectator).map(p=>[p.rank,p.name,...places.map((_,i)=>state.history.find(h=>h.round===i+1)?.results.find(r=>r.id===p.id)?.score??0),p.score])];
    const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`wordscape-${state.code}-scores.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  let socket;
  const request=(event,data={})=>new Promise((resolve,reject)=>{
    if(!socket?.connected){reject(new Error('Still connecting. Please wait a moment.'));return;}
    socket.timeout(8000).emit(event,data,(error,response)=>{if(error){reject(new Error('The server took too long to reply. Check your connection.'));return;}if(!response?.ok){reject(new Error(response?.error||'Please try again.'));return;}resolve(response);});
  });
  app.addEventListener('input',event=>{if(event.target.id==='guess-input')draft=event.target.value;if(event.target.id==='player-name')entryName=event.target.value;if(event.target.id==='room-code')codeInput=event.target.value.toUpperCase();});
  app.addEventListener('submit',async event=>{
    event.preventDefault();
    if(event.target.id==='entry-form'){
      if(busy)return;busy=true;const form=event.target,data=new FormData(form),button=form.querySelector('button[type=submit]');button.disabled=true;button.textContent='Connecting…';$('entry-error').textContent='';
      try{const response=await request(entryMode==='host'?'create':'join',{name:data.get('name'),code:data.get('code'),spectator:data.has('spectator')});storeSeat({code:response.code,token:response.token});lateJoin=entryMode==='join'&&response.state.round>0;applyState(response.state);}
      catch(error){if($('entry-error'))$('entry-error').textContent=error.message;button.disabled=false;button.textContent=entryMode==='host'?'Create game →':'Enter the arena →';}finally{busy=false;}
    }
    if(event.target.id==='guess-form'){
      const input=$('guess-input'),word=input.value.trim();if(!word)return;
      draft='';input.value='';
      try{const response=await request('guess',{word});feedback={status:response.status,message:response.message};if(response.status==='hit'){beep(true);toast(`+${response.points} · ${response.word}`,'success');}else if(response.status==='close')beep(false);
        if($('guess-feedback')){$('guess-feedback').textContent=feedback.message;$('guess-feedback').className=`guess-feedback ${feedback.status}`;}
        if($('guess-input')&&!$('guess-input').disabled)$('guess-input').focus({preventScroll:true});
      }catch(error){feedback={status:'miss',message:error.message};if($('guess-feedback')){$('guess-feedback').textContent=error.message;$('guess-feedback').className='guess-feedback miss';}}
    }
  });
  app.addEventListener('click',async event=>{
    const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
    const action=button.dataset.action;
    if(action==='tab'){entryMode=button.dataset.tab;home();return;}
    if(action==='help'){openDialog('help-dialog');return;}
    if(action==='zoom'){zoom();return;}
    if(action==='download'){downloadScores();return;}
    if(action==='copy'){
      const url=new URL(location.href);url.search='';url.searchParams.set('room',state.code);url.hash='';
      try{await navigator.clipboard.writeText(url.href);toast('Invite link copied. Send it to your class.','success');}catch{toast(`Room code: ${state.code}. Open this website and enter the code.`);}return;
    }
    if(action==='leave'){
      if(state?.phase==='playing'&&!window.confirm('Leave this round? Your score stays in this room.'))return;
      try{await request('leave');}catch{socket?.disconnect();setTimeout(()=>socket?.connect(),100);}storeSeat(null);state=null;draft='';lateJoin=false;home();return;
    }
    if(action==='reveal'&&!window.confirm('End this round now and reveal all 20 answers to the room?'))return;
    button.disabled=true;
    try{
      if(action==='solo'){
        const response=await request('create',{name:entryName.trim().length>=2?entryName:'Explorer',spectator:false});storeSeat({code:response.code,token:response.token});applyState(response.state);await request('start');
      }else if(['start','next','pause','reveal','restart'].includes(action)){await request(action);}
    }catch(error){toast(error.message,'error');button.disabled=false;}
  });
  home();
  if(typeof window.io!=='function'){status.hidden=false;status.classList.add('bad');status.textContent='The game server is unavailable. Start this project with npm start; it cannot run by opening index.html directly.';return;}
  socket=window.io({autoConnect:false,reconnection:true,reconnectionDelay:700,reconnectionDelayMax:5000});
  socket.on('connect',async()=>{
    connected=true;status.hidden=true;status.classList.remove('bad');
    if(saved){
      status.hidden=false;status.textContent='Rejoining your expedition…';
      try{const response=await request('resume',saved);applyState(response.state);status.hidden=true;}
      catch(error){storeSeat(null);state=null;home();status.hidden=true;toast(error.message,'error');}
    }else if(state)render();
  });
  socket.on('disconnect',()=>{connected=false;status.hidden=false;status.textContent='Connection lost. Reconnecting — your score is kept in this room.';if(state)render();});
  socket.on('connect_error',()=>{connected=false;status.hidden=false;status.classList.add('bad');status.textContent='Connecting to the server… On a sleeping Render service, the first visit can take a little longer.';});
  socket.on('state',applyState);
  // Only the successful guesser receives a word-board update. Others get a tiny score delta.
  socket.on('score',delta=>{
    if(!state)return;
    state.players=state.players.map(p=>p.id===delta.id?{...p,...delta}:p).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
    let prior=null,rank=0,count=0;
    for(const p of state.players)if(!p.spectator){count++;if(p.score!==prior)rank=count;p.rank=rank;prior=p.score;}
    const panel=app.querySelector('.scoreboard');if(panel){const scroll=panel.querySelector('.score-scroll')?.scrollTop||0;panel.outerHTML=scoreboard();app.querySelector('.score-scroll').scrollTop=scroll;}
  });
  socket.on('clock',data=>{clock={remainingMs:data.remainingMs,paused:data.paused,at:Date.now()};updateClock();});
  socket.on('replaced',()=>{storeSeat(null);state=null;toast('Your seat was opened in another connection. Rejoin with another name to play separately.','error');home();setTimeout(()=>socket.connect(),150);});
  socket.on('roomExpired',()=>{storeSeat(null);state=null;home();toast('This room has expired. Create a new expedition.','error');setTimeout(()=>socket.connect(),150);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state&&connected)request('sync').then(r=>applyState(r.state)).catch(()=>{});});
  setInterval(updateClock,250);socket.connect();
})();
