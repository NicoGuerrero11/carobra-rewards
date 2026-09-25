import {learningCatalog} from './learning-catalog.js';

export function reportOptions(args: string[]) {
  const options = {courseId:null as number|null,customerId:null as string|null,limit:100,offset:0};
  for(let i=0;i<args.length;i+=2) {
    const key=args[i],value=args[i+1];
    if(!value) throw Error('Each option requires a value');
    if(key==='--customer-id' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) options.customerId=value;
    else if(['--course-id','--limit','--offset'].includes(key!) && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) {
      if(key==='--course-id') options.courseId=Number(value);
      if(key==='--limit') options.limit=Number(value);
      if(key==='--offset') options.offset=Number(value);
    } else throw Error('Invalid report option');
  }
  if(options.limit<1 || options.limit>1000 || options.offset<0 || (options.courseId!==null && options.courseId<1)) throw Error('Invalid report bounds');
  return options;
}

export function progressCsv(rows: Record<string,unknown>[]) {
  const cell=(value:unknown)=>{
    let text=value instanceof Date ? value.toISOString() : String(value??'');
    if(/^[=+\-@\t\r\n]/.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  const result=[['customer_id','course_id','course','chapter_id','video','recorded_percent','manual_completed_at','playback_completed_at','updated_at']];
  for(const row of rows) {
    const course=learningCatalog.find(c=>c.id===Number(row.course_id));
    const chapter=course?.chapters.find(c=>c.postId===Number(row.chapter_id));
    const percent=Number(row.duration_seconds)>0 ? Math.min(100,Math.floor(Number(row.watched_seconds)/Number(row.duration_seconds)*100)) : '';
    result.push([row.customer_id,row.course_id,course?.title??'',row.chapter_id,chapter?.title??'',percent,row.manual_completed_at,row.playback_completed_at,row.updated_at].map(v=>v as string));
  }
  return result.map(row=>row.map(cell).join(',')).join('\n')+'\n';
}
