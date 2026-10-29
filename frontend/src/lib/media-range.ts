export function parseRange(value:string|null,size:number):{start:number;end:number}|null {
  if (value===null) return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size<=0) throw new Error('Unsatisfiable byte range');
  const first=match[1] ? Number(match[1]) : null;
  const last=match[2] ? Number(match[2]) : null;
  if ((first!==null && !Number.isSafeInteger(first)) || (last!==null && !Number.isSafeInteger(last))) throw new Error('Unsatisfiable byte range');
  const start=first ?? Math.max(0,size-(last ?? 0));
  const end=first===null ? size-1 : Math.min(last ?? size-1,size-1);
  if(start<0 || start>=size || end<start) throw new Error('Unsatisfiable byte range');
  return {start,end};
}
