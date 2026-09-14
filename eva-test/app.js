const $=id=>document.getElementById(id);
const audio=new Audio(); audio.preload='metadata'; audio.id='eva-audio'; document.body.append(audio);
let manifest,index=-1,phase='opening',running=false,player=null,ready=false,revision=0,timer=null,apiPromise=null,loadingTicket=null;
let awaitingVideoTap=false,videoStarting=false,explicitPause=false;
// Private, in-memory command evidence only; no telemetry or personal data.
const pauseTrace=[];
function trace(reason){pauseTrace.push({reason,phase,revision,running,hidden:document.hidden,at:performance.now()});if(pauseTrace.length>80)pauseTrace.shift();}
function pauseYouTube(reason){trace(reason);try{player?.pauseVideo();}catch{}}
function acceptVideo(){clearTimeout(timer);videoStarting=false;videoTap(false);audio.pause();phase='video';running=true;render();say('Video speelt. '+(current()?.note||''));}
function videoTap(show){awaitingVideoTap=show;$('start-video').hidden=!show;}
function autoplayFallback(){if(phase!=='video'||!videoStarting||explicitPause)return;if(player?.getPlayerState()===1){acceptVideo();return;}clearTimeout(timer);videoStarting=false;running=false;audio.pause();videoTap(true);controls();trace('await-native-play');say('Tik op ▶ in de YouTube-video om het lied te starten.');}
const say=t=>$('status').textContent=t;
const current=()=>manifest?.tracks[index];
function controls(){ $('play').textContent=running?'Pauzeren':'Afspelen'; }
function destroy(){videoTap(false);videoStarting=false;clearTimeout(timer);loadingTicket=null;ready=false;if(player){try{player.mute();player.destroy();}catch{}player=null;}$('video-mount').replaceChildren();$('video-placeholder').hidden=false;}
function pause(message='Gepauzeerd. Klik Afspelen om verder te gaan.',reason='user-pause'){explicitPause=true;videoTap(false);videoStarting=false;running=false;audio.pause();pauseYouTube(reason);clearTimeout(timer);controls();say(message);}
function resetMedia(){explicitPause=false;revision++;audio.pause();audio.removeAttribute('src');audio.load();destroy();}
function render(){const t=current();$('eva-visual').hidden=phase==='video';$('eva-visual').classList.toggle('compact',phase==='story');$('video-shell').hidden=phase==='opening'||phase==='closing';$('eva-caption').textContent=phase==='closing'?'Tot de volgende luisterreis.':phase==='story'?'Eva vertelt het verhaal achter dit lied.':'Eerst het verhaal. Dan de muziek.';$('title').textContent=phase==='opening'?'Even gaan zitten.':phase==='closing'?'Tot de volgende keer.':t.title;$('artist').textContent=t?.artist||'Een kleine luisterreis met Eva.';$('phase').textContent=phase==='video'?'YouTube · het lied':'Eva · '+({opening:'opening',story:'het verhaal',closing:'afsluiting'}[phase]);$('version').textContent=t?.note||'';$('external').hidden=!t;$('external').href=t?.source||'#';$('skip-story').hidden=phase!=='story';document.querySelectorAll('#tracks button').forEach((b,i)=>{b.setAttribute('aria-current',i===index?'true':'false');});controls();}
function select(i,play=running){resetMedia();index=Math.max(-1,Math.min(i,manifest.tracks.length));phase=index<0?'opening':index===manifest.tracks.length?'closing':'story';running=play;render();say(play?'Laden…':'Klaar. Klik Afspelen.');if(play)start();}
async function api(){if(window.YT?.Player)return;if(apiPromise)return apiPromise;apiPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.id='youtube-api';script.src='https://www.youtube.com/iframe_api';window.onYouTubeIframeAPIReady=resolve;script.onerror=()=>{apiPromise=null;script.remove();reject(new Error('YouTube-script niet bereikbaar'));};document.head.append(script);});return apiPromise;}
function blocked(message){pause(message+' Probeer Afspelen of de knop in de video. Werkt dat niet, open de YouTube-link of kies Volgende.');}
function playVideo(){if(phase!=='video'||!running||!ready)return;if(document.hidden){pause('Video gepauzeerd: houd de speler zichtbaar en klik Afspelen.');return;}audio.pause();videoTap(true);videoStarting=true;arm(revision);player.unMute();player.playVideo();}
async function preloadVideo(){
 const ticket=revision,t=current();if(!t||player||loadingTicket===ticket)return;loadingTicket=ticket;
 const failed=message=>{if(ticket!==revision)return;destroy();if(phase==='video')blocked(message);};
 timer=setTimeout(()=>failed('YouTube reageert niet; mogelijk netwerk-, privacy- of embedblokkade.'),15000);
 try{await api();if(ticket!==revision||loadingTicket!==ticket)return;
 $('video-placeholder').hidden=true;const mount=document.createElement('div');mount.id='youtube-frame';$('video-mount').replaceChildren(mount);
 player=new YT.Player(mount,{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',videoId:t.primary,playerVars:{autoplay:0,mute:1,controls:1,playsinline:1,origin:location.origin,rel:0,disablekb:0},events:{
 onReady:e=>{if(ticket!==revision||e.target!==player)return;ready=true;loadingTicket=null;clearTimeout(timer);e.target.mute();e.target.cueVideoById(t.primary);e.target.getIframe().title=t.videoTitle;e.target.getIframe().setAttribute('referrerpolicy','strict-origin-when-cross-origin');if(phase==='video')playVideo();},
 onStateChange:e=>{if(ticket!==revision||e.target!==player)return;
 trace('yt-state-'+e.data);
 if(e.data===YT.PlayerState.PLAYING){
  if(document.hidden||explicitPause){pauseYouTube(document.hidden?'playing-hidden':'playing-after-explicit-pause');return;}
  // autoplay=0 preload cannot intentionally start itself: native Play takes over
  // from Eva too. A PAUSED event is an observation, never a playback veto.
  acceptVideo();
 }else if(e.data===YT.PlayerState.BUFFERING&&phase==='story'&&!explicitPause&&!document.hidden){
  audio.pause();phase='video';running=true;render();
 }else if(phase==='video'&&e.data===YT.PlayerState.ENDED&&running){clearTimeout(timer);select(index+1,true);
 }else if(phase==='video'&&e.data===YT.PlayerState.PAUSED){if(videoStarting||awaitingVideoTap)return;running=false;controls();say('Video gepauzeerd.');}},
 onAutoplayBlocked:e=>{if(ticket===revision&&e.target===player&&phase==='video'&&videoStarting)autoplayFallback();},
 onError:e=>{if(ticket!==revision||e.target!==player)return;const errors={2:'Ongeldige videoaanvraag',5:'HTML5-afspeelfout',100:'Video verwijderd of privé',101:'Insluiten niet toegestaan',150:'Insluiten niet toegestaan',153:'YouTube accepteert de browseridentificatie niet'};failed((errors[e.data]||'YouTube-afspeelfout')+' (code '+e.data+').');}}});
 }catch(e){failed(e.message);}}
async function video(){audio.pause();render();if(document.hidden){pause('Video gepauzeerd: houd de speler zichtbaar en klik Afspelen.');return;}if(ready){playVideo();return;}say('YouTube laden…');await preloadVideo();}
function arm(ticket){clearTimeout(timer);timer=setTimeout(()=>{if(ticket===revision&&player?.getPlayerState()!==1)autoplayFallback();},4000);}
async function start(){if(!manifest)return;explicitPause=false;if(document.hidden){pause('Kom terug naar deze pagina om te luisteren.');return;}running=true;controls();if(phase==='video'){await video();return;}const src=phase==='opening'?manifest.opening:phase==='closing'?manifest.closing:current().speech;if(!src){pause('Deze Eva-opname ontbreekt. Kies Naar de video of Volgende.');return;}const ticket=revision;if(audio.getAttribute('src')!==src)audio.src=src;try{await audio.play();if(ticket!==revision||!running||phase==='video')return;say('Eva vertelt…');if(phase==='story')preloadVideo();}catch(e){if(ticket===revision&&phase!=='video')blocked('De Eva-audio kon niet starten.');}}
audio.addEventListener('ended',()=>{if(!running||phase==='video')return;if(phase==='opening'){const ticket=revision;setTimeout(()=>{if(ticket===revision&&running)select(0,true);},0);}else if(phase==='story'){phase='video';render();video();}else{select(-1,false);say('De luisterreis is afgelopen.');}});
audio.addEventListener('error',()=>{if(phase!=='video'&&audio.getAttribute('src'))pause('Eva-audio niet beschikbaar. Kies Naar de video of Volgende; er wordt geen andere stem gebruikt.');});
$('play').onclick=()=>running?pause():start();$('stop').onclick=()=>{select(-1,false);say('Gestopt. Afspelen begint opnieuw bij de opening.');};$('next').onclick=()=>select(Math.min(index+1,manifest.tracks.length));$('prev').onclick=()=>select(Math.max(index-1,0));
$('skip-story').onclick=()=>{explicitPause=false;audio.pause();phase='video';running=true;render();video();};
$('start-video').onclick=()=>{if(phase!=='video')return;explicitPause=false;running=true;controls();video();};
$('external').onclick=()=>pause('Gepauzeerd voor YouTube. Bij terugkomst kun je verder luisteren.');
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause('Gepauzeerd omdat de pagina niet zichtbaar is. Klik Afspelen bij terugkomst.','document-hidden');});
// Scrolling/layout changes are not page hiding. Never cancel a native iframe play
// using a stale IntersectionObserver ratio (especially after hiding Eva on mobile).
try{const response=await fetch('manifest.json');if(!response.ok)throw Error('Afspeellijst niet bereikbaar');manifest=await response.json();if(manifest.tracks.length!==11)throw Error('Onvolledige afspeellijst');manifest.tracks.forEach((t,i)=>{const li=document.createElement('li'),b=document.createElement('button'),name=document.createElement('strong'),artist=document.createElement('span'),note=document.createElement('small');b.type='button';name.textContent=t.title;artist.textContent=t.artist;note.textContent=t.versionNotice||t.channel;b.append(name,artist,note);b.onclick=()=>select(i,false);li.append(b);$('tracks').append(li);});$('availability').textContent='Kies een lied, of luister vanaf het begin.';for(const id of ['play','prev','next','stop'])$(id).disabled=false;select(-1,false);}catch(e){say('Laden mislukt: '+e.message+' Herlaad de pagina.');}
