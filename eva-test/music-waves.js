/* Real stereo PCM RMS envelopes, sampled every 50 ms from the exact music
   files. Read-only visualization: never reroutes, mutes or changes audio.
   Missing data/canvas support cannot interfere with native playback. */
(()=>{
  const audio=document.getElementById('audio');
  const canvas=document.createElement('canvas');
  canvas.className='music-waves';canvas.setAttribute('aria-hidden','true');
  canvas.style.cssText='display:block;width:100%;height:64px;margin:18px 0 4px';
  document.getElementById('status').before(canvas);
  const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return;}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let data=null,frame=0,last=0;
  function draw(){
    const w=canvas.clientWidth,h=64,dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==h*dpr){canvas.width=Math.round(w*dpr);canvas.height=h*dpr;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    ctx.strokeStyle='#696d60';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
    const track=data?.tracks[segments[index].src];
    if(!track||audio.paused||audio.ended||reduced.matches)return;
    const pos=Math.floor(audio.currentTime/track.step),bars=43,gap=w/bars;
    ctx.strokeStyle='#e7baa0';ctx.lineWidth=Math.max(2,gap*.42);ctx.lineCap='round';ctx.beginPath();
    for(let i=0;i<bars;i++){
      // A trailing two-second window; no random or synthetic oscillation.
      const level=(track.levels[pos-bars+1+i]||0)/255;
      const height=Math.min(29,level*90)*audio.volume;
      if(audio.muted||height<.2)continue;
      const x=(i+.5)*gap;ctx.moveTo(x,h/2-height);ctx.lineTo(x,h/2+height);
    }
    ctx.stroke();
  }
  function tick(now){frame=0;if(now-last>=50){draw();last=now;}if(!audio.paused&&!audio.ended&&!reduced.matches&&!document.hidden)frame=requestAnimationFrame(tick);}
  function sync(){cancelAnimationFrame(frame);frame=0;draw();if(!audio.paused&&!audio.ended&&!reduced.matches&&!document.hidden)frame=requestAnimationFrame(tick);}
  ['play','pause','ended','emptied','seeked','volumechange'].forEach(e=>audio.addEventListener(e,sync));
  reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  if(window.ResizeObserver)new ResizeObserver(draw).observe(canvas);else window.addEventListener('resize',draw);
  draw();fetch('music-waves.json?v=pcm-1',{credentials:'omit'}).then(r=>{if(!r.ok)throw Error('wave data');return r.json()}).then(v=>{data=v;sync();}).catch(()=>{canvas.remove();});
})();
