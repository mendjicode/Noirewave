'use strict';

// All tracks are synthesized in the browser. No third-party recordings are used.
const tracks = [
  {id:'afterdark',name:'AFTER DARK',genre:'trap',genreLabel:'Dark Trap',bpm:140,key:'F minor',price:'1 490 ₽',symbol:'AD',colors:['#403a60','#9d8ab1'],seed:11},
  {id:'eclipse',name:'ECLIPSE',genre:'ambient',genreLabel:'Ambient',bpm:92,key:'C minor',price:'1 490 ₽',symbol:'EC',colors:['#364957','#719ca8'],seed:19},
  {id:'velvet',name:'VELVET SKY',genre:'rnb',genreLabel:'R&B',bpm:86,key:'A minor',price:'1 490 ₽',symbol:'VS',colors:['#84504c','#c28a70'],seed:29},
  {id:'ghost',name:'GHOST MODE',genre:'trap',genreLabel:'Dark Trap',bpm:152,key:'D minor',price:'1 490 ₽',symbol:'GM',colors:['#525d38','#a4a95a'],seed:37},
  {id:'blue',name:'BLUE HOURS',genre:'ambient',genreLabel:'Ambient',bpm:78,key:'G minor',price:'1 490 ₽',symbol:'BH',colors:['#294c60','#5b7d9b'],seed:43},
  {id:'slow',name:'SLOW BURN',genre:'rnb',genreLabel:'R&B',bpm:96,key:'E minor',price:'1 490 ₽',symbol:'SB',colors:['#6d4861','#a27f97'],seed:53}
];
const grid = document.getElementById('beat-grid');
const player = document.getElementById('player');
const playToggle = document.getElementById('player-toggle');
const progressFill = document.getElementById('player-progress-fill');
const playerTime = document.getElementById('player-time');
const dialog = document.getElementById('request-dialog');
const requestText = document.getElementById('request-text');
let currentTrack = null;
let audioContext = null;
let master = null;
let startedAt = 0;
let accumulated = 0;
let timer = null;
let progressTimer = null;
let isPlaying = false;
let activeSources = new Set();
const LOOP_BARS = 4;

function render(filter='all') {
  const selected = tracks.filter(track=>filter === 'all'||track.genre===filter);
  grid.innerHTML = selected.map((track,index)=>`
    <article class="beat-card" aria-label="${track.name}">
      <div class="cover" style="background:radial-gradient(circle at 65% 30%,${track.colors[1]},transparent 60%),linear-gradient(135deg,${track.colors[0]},#171b1c)">
        <span class="cover-kicker">NOIRWAVE / ORIGINAL SOUND</span><span class="cover-symbol">${track.symbol}</span><span class="cover-number">NW-${String(tracks.indexOf(track)+1).padStart(3,'0')}</span>
      </div>
      <div class="beat-card-body"><h3 class="beat-card-title">${track.name}</h3>
        <div class="beat-card-meta">${track.genreLabel.toUpperCase()} &nbsp;·&nbsp; ${track.bpm} BPM &nbsp;·&nbsp; ${track.key}</div>
        <div class="beat-card-bottom"><div class="beat-price">${track.price}<span>демо-цена</span></div>
          <div class="card-actions"><button class="request-beat" type="button" data-request="${track.id}">ЗАПРОС ↗</button><button class="play-btn" type="button" data-play="${track.id}" aria-label="Прослушать ${track.name}" aria-pressed="${currentTrack?.id===track.id&&isPlaying}">${currentTrack?.id===track.id&&isPlaying?'Ⅱ':'▶'}</button></div>
        </div></div>
    </article>`).join('');
}

function setupAudio(){
  if(audioContext) return;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if(!AudioContextType){throw new Error('Ваш браузер не поддерживает Web Audio API');}
  audioContext = new AudioContextType();
  master = audioContext.createGain();
  master.gain.value = 0.32;
  const limiter = audioContext.createDynamicsCompressor();
  limiter.threshold.value = -16;
  limiter.knee.value = 14;
  limiter.ratio.value = 5;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.18;
  master.connect(limiter).connect(audioContext.destination);
}
function scheduleOsc(type,frequency,start,duration,volume,shape='sine'){
  const osc=audioContext.createOscillator(),gain=audioContext.createGain();
  osc.type=shape;osc.frequency.setValueAtTime(Math.max(20,frequency),start);
  gain.gain.setValueAtTime(0.0001,start);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),start+.008);
  gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(gain).connect(master);osc.start(start);osc.stop(start+duration+.02);
  activeSources.add(osc);osc.onended=()=>activeSources.delete(osc);
  return osc;
}
function kick(t,vol=0.65){
  const osc=scheduleOsc('kick',145,t,.35,vol);
  osc.frequency.exponentialRampToValueAtTime(43,t+.13);
}
let noiseBuffer=null;
function getNoise(){
  if(noiseBuffer) return noiseBuffer;
  const length=Math.ceil(audioContext.sampleRate*.5);noiseBuffer=audioContext.createBuffer(1,length,audioContext.sampleRate);
  const data=noiseBuffer.getChannelData(0);let seed=1997;
  for(let i=0;i<length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=(seed/4294967296)*2-1;}
  return noiseBuffer;
}
function noiseHit(t,duration=.1,volume=.13,highpass=1300){
  const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();
  source.buffer=getNoise();filter.type='highpass';filter.frequency.value=highpass;
  gain.gain.setValueAtTime(Math.max(.0001,volume),t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  source.connect(filter).connect(gain).connect(master);source.start(t);source.stop(t+duration+.005);
  activeSources.add(source);source.onended=()=>activeSources.delete(source);
}
const scales={trap:[87.31,103.83,130.81,155.56,174.61],ambient:[65.41,77.78,98,116.54,130.81],rnb:[82.41,98,123.47,146.83,164.81]};
function scheduleBar(track,start,barIndex){
  const step=60/track.bpm/4,beat=step*4,notes=scales[track.genre],offset=track.seed%notes.length;
  for(let i=0;i<16;i++){
    const t=start+i*step;
    if(i===0||i===8||(track.genre==='trap'&&i===11))kick(t,track.genre==='ambient'?.34:.64);
    if(i===4||i===12)noiseHit(t,.13,track.genre==='ambient'?.045:.13,650);
    if(track.genre!=='ambient' || i%2===0)noiseHit(t,.028,track.genre==='trap'?.065:.028,5000);
    if((track.genre==='trap'&&[0,6,8,11,14].includes(i))||(track.genre==='rnb'&&[0,7,10,14].includes(i))||(track.genre==='ambient'&&[0,8].includes(i))){
      const base=notes[(offset+barIndex+(i===8?2:i===14?3:0))%notes.length];
      scheduleOsc('bass',base,t,Math.min(step*3,.5),track.genre==='ambient'?.06:.25,'triangle');
    }
  }
  if(track.genre==='ambient'){
    const chord=[notes[0]*2,notes[2]*2,notes[4]*2];
    chord.forEach((note,index)=>scheduleOsc('pad',note,start+.04,beat*3.6,.012,'sine'));
  }else if(track.genre==='rnb'){
    [0,2,4].forEach((n,i)=>scheduleOsc('chord',notes[n]*4,start+.02,beat*1.5,.024,'sine'));
    [0,5,10,13].forEach((i,n)=>scheduleOsc('lead',notes[(n+offset)%notes.length]*4,start+i*step,.15,.027,'triangle'));
  }else{
    [0,3,7,12].forEach((i,n)=>scheduleOsc('lead',notes[(offset+n+barIndex)%notes.length]*4,start+i*step,.12,.034,'sine'));
  }
}
function stopSources(){for(const source of activeSources){try{source.stop()}catch{}}activeSources.clear();}
function stopScheduling(){if(timer){clearInterval(timer);timer=null}if(progressTimer){clearInterval(progressTimer);progressTimer=null}}
let nextBarTime=0,barCount=0;
function scheduleLoop(){
  if(!audioContext||!currentTrack||!isPlaying)return;
  const barLength=60/currentTrack.bpm*4;
  while(nextBarTime<audioContext.currentTime+.18){
    scheduleBar(currentTrack,nextBarTime,barCount%LOOP_BARS);
    nextBarTime+=barLength;barCount++;
  }
}
function updateProgress(){
  if(!currentTrack)return;
  const seconds=accumulated+(isPlaying&&audioContext?audioContext.currentTime-startedAt:0);
  const loopLength=60/currentTrack.bpm*4*LOOP_BARS;
  progressFill.style.width=`${((seconds%loopLength)/loopLength)*100}%`;
  playerTime.textContent=`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
}
function syncButtons(){
  document.querySelectorAll('[data-play]').forEach(btn=>{
    const active=btn.dataset.play===currentTrack?.id && isPlaying;
    btn.textContent=active?'Ⅱ':'▶';btn.setAttribute('aria-pressed',String(active));btn.setAttribute('aria-label',active?'Пауза':'Прослушать '+tracks.find(t=>t.id===btn.dataset.play)?.name);
  });
  playToggle.textContent=isPlaying?'Ⅱ':'▶';playToggle.setAttribute('aria-label',isPlaying?'Пауза':'Продолжить');
}
async function playTrack(id){
  try{
    setupAudio();await audioContext.resume();
    const track=tracks.find(t=>t.id===id);if(!track)return;
    if(currentTrack?.id===id && isPlaying){pause();return;}
    stopScheduling();stopSources();
    if(currentTrack?.id!==id)accumulated=0;
    currentTrack=track;isPlaying=true;startedAt=audioContext.currentTime;nextBarTime=startedAt+.05;barCount=0;
    player.hidden=false;document.getElementById('player-title').textContent=track.name;
    document.getElementById('player-subtitle').textContent=`${track.genreLabel} · ${track.bpm} BPM`;
    document.getElementById('player-cover').style.background=`linear-gradient(125deg,${track.colors[0]},${track.colors[1]})`;
    scheduleLoop();timer=setInterval(scheduleLoop,90);progressTimer=setInterval(updateProgress,100);
    syncButtons();updateProgress();
  }catch(error){console.error(error);alert('Не удалось запустить аудио. Попробуйте открыть сайт в современном браузере.');}
}
function pause(){if(!currentTrack||!isPlaying)return;accumulated+=audioContext.currentTime-startedAt;isPlaying=false;stopScheduling();stopSources();syncButtons();updateProgress()}
function closePlayer(){pause();currentTrack=null;accumulated=0;player.hidden=true;syncButtons()}
function openRequest(info){
  document.getElementById('copy-feedback').textContent='';
  requestText.value=`Здравствуйте! Интересует ${info}. Подскажите, пожалуйста, доступность, условия лицензии и стоимость.`;
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
}
render();
document.querySelectorAll('.filter').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('.filter').forEach(b=>{const selected=b===button;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected))});
  render(button.dataset.filter);
}));
grid.addEventListener('click',event=>{
  const play=event.target.closest('[data-play]');if(play){playTrack(play.dataset.play);return;}
  const request=event.target.closest('[data-request]');if(request){const track=tracks.find(t=>t.id===request.dataset.request);if(track)openRequest(`бит «${track.name}» (${track.genreLabel}, ${track.bpm} BPM)`)}
});
playToggle.addEventListener('click',()=>{if(currentTrack)playTrack(currentTrack.id)});
document.getElementById('player-close').addEventListener('click',closePlayer);
document.querySelectorAll('[data-license]').forEach(button=>button.addEventListener('click',()=>openRequest(`лицензия «${button.dataset.license}»`)));
document.getElementById('open-contact').addEventListener('click',()=>openRequest('сотрудничество по созданию музыки'));
document.getElementById('close-request').addEventListener('click',()=>dialog.close());
document.getElementById('copy-request').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(requestText.value);document.getElementById('copy-feedback').textContent='Текст скопирован!';}
  catch{requestText.focus();requestText.select();document.getElementById('copy-feedback').textContent='Выделите текст и скопируйте вручную (Ctrl+C).';}
});
const mobileMenu=document.querySelector('.mobile-menu'),mobileNav=document.querySelector('.mobile-nav');
mobileMenu.addEventListener('click',()=>{const willOpen=mobileNav.hidden;mobileNav.hidden=!willOpen;mobileMenu.setAttribute('aria-expanded',String(willOpen))});
mobileNav.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{mobileNav.hidden=true;mobileMenu.setAttribute('aria-expanded','false')}));
window.addEventListener('pagehide',()=>{stopScheduling();stopSources();if(audioContext)audioContext.close()});
