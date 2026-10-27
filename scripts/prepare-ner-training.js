// Non-destructive: legacy dataset stays unchanged. Writes a new versioned set.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { cleanNerDataset,canonical,fingerprint,NER_LABELS } from './lib/nerDataset.js'

export function prepareNerTraining() {
  const root=fileURLToPath(new URL('../',import.meta.url))
  const rows=[]
  // Recover video/venue provenance discarded by the legacy dataset builder.
  const byCaption=new Map()
  const captionKey=(s)=>canonical(s.replace(/([^\p{L}\p{N}\s])/gu,' $1 ').replace(/\s+/g,' '))
  for(const cap of JSON.parse(readFileSync(resolve(root,'ml/youtube-captions.json'),'utf8'))){
    const key=captionKey(cap.title||cap.description||'')
    if(!byCaption.has(key))byCaption.set(key,[])
    byCaption.get(key).push(cap)
  }
  const manifest={}
  for(const split of ['train','val','test','test_template']){
    const file=resolve(root,`ml/ner-dataset/${split}.jsonl`)
    const text=readFileSync(file,'utf8')
    manifest[split]=fingerprint(text)
    for(const line of text.split(/\r?\n/).filter((l)=>l.trim())){
      const row=JSON.parse(line)
      const caps=row.source==='youtube-real'?(byCaption.get(captionKey(row.tokens.join(' ')))??[]):[]
      rows.push({...row,original_split:split,video_ids:caps.map((c)=>c.videoId).filter(Boolean),group_names:caps.map((c)=>c.placeName).filter(Boolean)})
    }
  }
  const result=cleanNerDataset(rows)
  const expected=Object.fromEntries(NER_LABELS.map((l,i)=>[l,i]))
  const output={...Object.fromEntries(Object.entries(result.splits).map(([name,list])=>[name+'.jsonl',list.map(JSON.stringify).join('\n')+'\n'])),
    'labels.json':JSON.stringify(NER_LABELS,null,2)+'\n','quarantine.jsonl':result.quarantine.map(JSON.stringify).join('\n')+'\n',
    'dataset-report.json':JSON.stringify({...result.report,version:'2026-10-14-v2',input_sha256:manifest,
      label_to_id:expected,annotation_quality:'Weak supervision; not certified human gold labels.',
      split_policy:'Legacy real test and validation holdouts take priority. Connected business names, venue aliases and video ids stay within one partition. Validation/test metrics use real captions only.',
      provenance_matched:rows.filter((r)=>r.video_ids.length).length,negative_examples_added:0,
      limitations:['Mostly synthetic training sentences.','No human-verified negative-caption set yet.','Real-caption labels were generated automatically; manual audit still required.']},null,2)+'\n'}
  return {root,result,output}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  // Dry audit only. package-ner-colab.js generates the new set, never the inputs.
  const {result}=prepareNerTraining()
  console.log(JSON.stringify(result.report,null,2))
  if(Object.values(result.splits).some((rows)=>!rows.length))process.exitCode=1
}
