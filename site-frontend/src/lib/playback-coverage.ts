export type Range = [number,number];
export function unionRanges(ranges: readonly Range[]): Range[] {
  const out: Range[] = [];
  for (const [a,b] of [...ranges].sort((x,y)=>x[0]-y[0])) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= a) continue;
    const last=out.at(-1);
    if(last && a <= last[1]) last[1]=Math.max(last[1],b);
    else out.push([a,b]);
  }
  return out;
}
export function coveredSeconds(ranges:readonly Range[]) {
  return unionRanges(ranges).reduce((sum,[a,b])=>sum+b-a,0);
}

// Only continuous forward playback counts. An ended/seek event is never proof of coverage.
export class PlaybackCoverage {
  ranges:Range[]=[];
  private previous:{seconds:number;at:number}|null=null;
  private playing=false;
  rate=1;
  start(seconds:number,at:number) {this.playing=true;this.previous={seconds,at};}
  stop() {this.playing=false;this.previous=null;}
  discontinuity() {this.previous=null;}
  sample(seconds:number,at:number):boolean {
    const previous=this.previous;
    this.previous=this.playing ? {seconds,at} : null;
    if(!this.playing || !previous || !Number.isFinite(seconds) || seconds<0) return false;
    const delta=seconds-previous.seconds, wall=(at-previous.at)/1000;
    if(delta<=0 || wall<0 || wall>5 || delta>wall*Math.max(.25,this.rate)+.5) return false;
    const next=unionRanges([...this.ranges,[previous.seconds,seconds]]);
    if(next.length>256) return false;
    const changed=coveredSeconds(next)>coveredSeconds(this.ranges);
    this.ranges=next;
    return changed;
  }
}
