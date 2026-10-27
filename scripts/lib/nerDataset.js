import { createHash } from 'node:crypto'

export const NER_LABELS = ['O','B-BUSINESS','I-BUSINESS','B-LOC','I-LOC']
export const canonical = (s) => String(s).normalize('NFC').replaceAll('_',' ').toLocaleLowerCase('vi').replace(/\s+/g,' ').trim()
export const fingerprint = (s) => createHash('sha256').update(s).digest('hex')
export const sentenceKey = (row) => canonical(row.tokens.join(' '))

export function validateNerRow(row) {
  if (!Array.isArray(row.tokens) || !row.tokens.length || !Array.isArray(row.ner_tags) || row.tokens.length !== row.ner_tags.length) throw new Error('invalid-token-label-length')
  let previous = 'O'
  for (let i=0;i<row.tokens.length;i++) {
    const tag = row.ner_tags[i]
    if (typeof row.tokens[i] !== 'string' || !row.tokens[i].trim() || !NER_LABELS.includes(tag)) throw new Error('invalid-token-label')
    if (tag.startsWith('I-') && ![tag,`B-${tag.slice(2)}`].includes(previous)) throw new Error('invalid-bio-sequence')
    previous = tag
  }
}

export function businessNames(row) {
  const names=[]
  for (let i=0;i<row.tokens.length;i++) {
    if (row.ner_tags[i] !== 'B-BUSINESS') continue
    const tokens=[row.tokens[i]]
    while (row.ner_tags[i+1] === 'I-BUSINESS') tokens.push(row.tokens[++i])
    names.push(canonical(tokens.join(' ')))
  }
  return [...new Set(names)]
}

/** Group all mentions/aliases from a caption and its video before splitting.
 * Legacy real test/validation membership has priority over generated templates.
 * This does not certify automatically matched annotations as human-reviewed.
 */
export function cleanNerDataset(input) {
  const unique=new Map(),conflicts=new Set(),quarantine=[]
  let duplicates=0
  for (const row of input) {
    try { validateNerRow(row) } catch (e) { quarantine.push({...row,reason:e.message}); continue }
    const key=sentenceKey(row)
    const previous=unique.get(key)
    if (previous && JSON.stringify(previous.ner_tags)!==JSON.stringify(row.ner_tags)) {
      conflicts.add(key); quarantine.push({...previous,reason:'conflicting-labels'},{...row,reason:'conflicting-labels'}); continue
    }
    if (!previous) unique.set(key,{...row,original_splits:[row.original_split]})
    else {
      duplicates++
      previous.original_splits.push(row.original_split)
      if (row.source==='youtube-real') previous.source='youtube-real'
      previous.group_names=[...new Set([...(previous.group_names??[]),...(row.group_names??[])])]
      previous.video_ids=[...new Set([...(previous.video_ids??[]),...(row.video_ids??[])])]
    }
  }
  const rows=[...unique.entries()].filter(([key])=>!conflicts.has(key)).map(([,row])=>row)
  const parents=rows.map((_,i)=>i)
  const root=(i)=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i]}return i}
  const first=new Map()
  rows.forEach((row,i)=>{
    const keys=[...businessNames(row).map((n)=>'name:'+n),...(row.group_names??[]).map((n)=>'name:'+canonical(n)),...(row.video_ids??[]).map((v)=>'video:'+v)]
    for (const key of keys) { if(first.has(key)) parents[root(i)]=root(first.get(key)); else first.set(key,i) }
  })
  const groups=new Map()
  rows.forEach((row,i)=>{const k=root(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row)})
  const splits={train:[],val:[],test:[],val_template:[],test_template:[]}
  for (const group of groups.values()) {
    const names=[...new Set(group.flatMap((r)=>[...businessNames(r),...(r.group_names??[]).map(canonical)]))].sort()
    const videos=[...new Set(group.flatMap((r)=>r.video_ids??[]))].sort()
    const groupId=fingerprint(JSON.stringify([names,videos,names.length||videos.length?null:sentenceKey(group[0])])).slice(0,24)
    const bucket=parseInt(groupId.slice(0,8),16)/0x100000000
    const hasRealTest=group.some((r)=>r.source==='youtube-real' && r.original_splits.includes('test'))
    const hasRealVal=group.some((r)=>r.source==='youtube-real' && r.original_splits.includes('val'))
    const hasReal=group.some((r)=>r.source==='youtube-real')
    const partition=hasRealTest?'test':hasRealVal?'val':hasReal?'train':bucket<0.8?'train':bucket<0.9?'val':'test'
    for (const row of group) {
      const split=partition==='train'||row.source==='youtube-real'?partition:partition+'_template'
      const {original_split:_originalSplit,original_splits:_originalSplits,group_names:_groupNames,...data}=row
      splits[split].push({...data,group_id:groupId})
    }
  }
  for (const list of Object.values(splits)) list.sort((a,b)=>fingerprint(sentenceKey(a)).localeCompare(fingerprint(sentenceKey(b))))
  const partition=(name)=>name.split('_')[0]
  const seenNames=new Map(),seenTexts=new Map(),seenVideos=new Map()
  for (const [split,list] of Object.entries(splits)) for (const row of list) {
    for (const [map,keys] of [[seenNames,businessNames(row)],[seenTexts,[sentenceKey(row)]],[seenVideos,row.video_ids??[]]]) for(const key of keys){
      if(map.has(key)&&map.get(key)!==partition(split))throw new Error('cross-partition-leak: '+key)
      map.set(key,partition(split))
    }
  }
  return {splits,quarantine,report:{input:input.length,duplicates_removed:duplicates,conflicting_texts:conflicts.size,
    quarantined:quarantine.length,groups:groups.size,counts:Object.fromEntries(Object.entries(splits).map(([k,v])=>[k,v.length])),
    sources:Object.fromEntries(Object.entries(splits).map(([k,v])=>[k,v.reduce((a,r)=>({...a,[r.source]:(a[r.source]??0)+1}),{})])),
    cross_partition_business_overlap:0,cross_partition_text_overlap:0,cross_partition_video_overlap:0}}
}


// Venue-name comparison lives with the Edge Functions so both sides share it.
export { coreName, sameVenue } from '../../supabase/functions/_shared/placeNames.js'
