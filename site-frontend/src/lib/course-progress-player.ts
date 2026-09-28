import Player from '@vimeo/player';
import {PlaybackCoverage,coveredSeconds} from './playback-coverage';
import type {CourseProgress} from './courses';

export function attachCourseProgress() {
  const root=document.querySelector<HTMLElement>('[data-course-progress]');
  let iframe=document.querySelector<HTMLIFrameElement>('#course-player');
  if(!root || !iframe) return;
  const button=root.querySelector<HTMLButtonElement>('#mark-video-seen')!;
  const status=root.querySelector<HTMLElement>('#video-progress-status')!;
  const feedback=root.querySelector<HTMLElement>('#progress-feedback')!;
  const retry=root.querySelector<HTMLButtonElement>('#retry-progress')!;
  const summary=document.querySelector<HTMLElement>('#course-progress-summary')!;
  const links=[...document.querySelectorAll<HTMLAnchorElement>('[data-chapter]')];
  const endpoint=`/api/v1/rewards/courses/${root.dataset.courseId}/progress`;
  let confirmed:CourseProgress|null=JSON.parse(root.dataset.progress ?? 'null');
  type State={id:number;duration:number;tracker:PlaybackCoverage;revision:number;ack:number;manual:boolean;thresholdSent:boolean};
  const states=new Map<number,State>();
  for(const link of links) {
    const id=Number(link.dataset.chapterId);
    states.set(id,{id,duration:Number(link.dataset.duration),tracker:new PlaybackCoverage(),revision:0,ack:0,manual:false,thresholdSent:false});
  }
  let selected=Number(root.dataset.selectedId);
  let player:Player;
  let generation=0, busy=false, queued=false, queuedKeepalive=false, error=!confirmed, stopped=false;
  function render() {
    const row=confirmed?.chapters.find(row=>row.chapter_id===selected);
    const completed=Boolean(row?.manual_completed_at || row?.playback_completed_at);
    root!.dataset.completed=String(completed);
    button.hidden=completed;
    button.disabled=Boolean(states.get(selected)?.manual) || completed;
    button.textContent=busy && states.get(selected)?.manual ? 'Guardando…' : 'Marcar como completado';
    status.textContent=completed ? '✓ Completado' : confirmed ? 'Sin completar' : 'Estado no disponible';
    if(confirmed) summary.textContent=`${confirmed.completed_chapters} de ${confirmed.total_chapters} videos completados${confirmed.completed ? ' · Curso completado' : ''}`;
    retry.hidden=!error;
    feedback.textContent=error ? 'No pudimos guardar o consultar tu avance. Reintenta antes de salir; puedes seguir viendo el video.' : '';
    links.forEach(link=>{
      const item=confirmed?.chapters.find(row=>row.chapter_id===Number(link.dataset.chapterId));
      const badge=link.querySelector<HTMLElement>('[data-chapter-status]');
      if(badge) badge.textContent=item?.manual_completed_at || item?.playback_completed_at ? '✓ Completado' : '';
    });
  }
  async function flush(keepalive=false) {
    if(![...states.values()].some(s=>s.revision>s.ack)) return;
    if(busy) {queued=true;queuedKeepalive ||= keepalive;render();return;}
    busy=true;render();
    try {
      for(const state of states.values()) {
        if(state.revision===state.ack) continue;
        const revision=state.revision, manual=state.manual;
        const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',keepalive,
          headers:{'content-type':'application/json','x-carobra-action':'course-progress'},
          signal:AbortSignal.timeout(12000),
          body:JSON.stringify({chapter_id:state.id,ranges:state.duration>0 ? state.tracker.ranges : [],manual})});
        if(!response.ok) throw new Error('save_failed');
        confirmed=await response.json();
        state.ack=revision;
        if(manual) state.manual=false;
      }
      error=false;
    } catch {error=true;} finally {
      busy=false;
      const shouldFlush=queued || [...states.values()].some(s=>s.manual && s.revision>s.ack);
      const keepaliveNext=queuedKeepalive;
      queued=false;queuedKeepalive=false;
      render();
      // Drain a threshold, pause/end, chapter switch or manual save queued behind an in-flight update.
      if(!error && shouldFlush) void flush(keepaliveNext);
    }
  }
  function mount() {
    const state=states.get(selected)!;
    const current=++generation;
    player=new Player(iframe!);
    const instance=player;
    const valid=()=>generation===current && !stopped;
    const sample=(data:{seconds:number})=>{
      if(!valid()) return;
      if(state.tracker.sample(data.seconds,performance.now())) state.revision++;
      const row=confirmed?.chapters.find(row=>row.chapter_id===state.id);
      const coverage=coveredSeconds([...(row?.played_ranges??[]),...state.tracker.ranges]);
      if(state.duration>0 && coverage/state.duration>=.8 && !row?.playback_completed_at && !state.thresholdSent) {
        state.thresholdSent=true;void flush();
      }
    };
    player.on('playing',data=>{if(valid())state.tracker.start(data.seconds,performance.now());});
    player.on('timeupdate',sample);
    player.on('seeking',()=>{if(valid())state.tracker.discontinuity();});
    player.on('seeked',()=>{if(valid())state.tracker.discontinuity();});
    player.on('bufferstart',()=>{if(valid())state.tracker.discontinuity();});
    player.on('bufferend',()=>{if(valid())state.tracker.discontinuity();});
    player.on('playbackratechange',data=>{if(valid()){state.tracker.discontinuity();state.tracker.rate=data.playbackRate;}});
    for(const event of ['pause','ended'] as const) player.on(event,data=>{if(valid()){sample(data);state.tracker.stop();void flush();}});
    // Player availability never overwrites the persisted completion state; manual marking remains usable.
    instance.ready().then(()=>instance.getPlaybackRate()).then(rate=>{if(valid())state.tracker.rate=rate;}).catch(()=>{});
  }
  button.addEventListener('click',()=>{
    const state=states.get(selected)!;state.manual=true;state.revision++;void flush();
  });
  retry.addEventListener('click',async()=>{
    if(busy) return;
    if([...states.values()].some(s=>s.revision>s.ack)) {void flush();return;}
    try {
      const response=await fetch(endpoint,{credentials:'same-origin',signal:AbortSignal.timeout(12000)});
      if(!response.ok) throw Error('load_failed');
      confirmed=await response.json();error=false;
    } catch {error=true;} render();
  });
  links.forEach(link=>link.addEventListener('click',event=>{
    const src=link.dataset.embed;
    if(!src || !/^https:\/\/player\.vimeo\.com\/video\/\d{1,20}\?dnt=1$/.test(src)) return;
    event.preventDefault();
    states.get(selected)!.tracker.stop();void flush();
    generation++;
    const old=player;
    const replacement=iframe!.cloneNode(false) as HTMLIFrameElement;
    replacement.src=src;replacement.title=link.dataset.title ?? 'Video del curso';
    iframe!.replaceWith(replacement);iframe=replacement;
    void old.destroy().catch(()=>{});
    selected=Number(link.dataset.chapterId);
    links.forEach(item=>item===link ? item.setAttribute('aria-current','true') : item.removeAttribute('aria-current'));
    document.querySelectorAll<HTMLElement>('[data-chapter-panel]').forEach(panel=>panel.hidden=panel.dataset.chapterPanel!==link.dataset.chapter);
    history.replaceState(null,'',link.href);render();mount();
  }));
  const interval=setInterval(()=>{if([...states.values()].some(s=>s.revision>s.ack)) void flush();},15000);
  window.addEventListener('online',()=>void flush());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void flush(true);});
  window.addEventListener('pagehide',()=>{void flush(true);clearInterval(interval);stopped=true;});
  window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
  render();mount();
}
