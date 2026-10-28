import test from 'node:test'
import assert from 'node:assert/strict'
import {cleanNerDataset,validateNerRow,businessNames} from '../scripts/lib/nerDataset.js'
import {prepareNerTraining} from '../scripts/prepare-ner-training.js'

const row=(name,split='train',source='real-place-template')=>({tokens:[name,'ngon'],ner_tags:['B-BUSINESS','O'],source,original_split:split})
test('NER rejects malformed BIO and token/label mismatches',()=>{
  assert.throws(()=>validateNerRow({tokens:['Quán'],ner_tags:[]}),/length/)
  assert.throws(()=>validateNerRow({tokens:['Quán'],ner_tags:['I-BUSINESS']}),/bio/)
  assert.deepEqual(businessNames({tokens:['Nhà','Hàng','Ngon'],ner_tags:['B-BUSINESS','I-BUSINESS','I-BUSINESS']}),['nhà hàng ngon'])
})
test('NER merges case variants, multi-place captions, aliases and shared videos before splitting',()=>{
  const a={...row('Cafe A'),group_names:['Cafe Alpha']}
  const b={...row('Cafe Alpha','test','youtube-real'),video_ids:['video']}
  const c={...row('Cafe B','train','youtube-real'),video_ids:['video']}
  const data=cleanNerDataset([a,b,c,{...row('CAFE A'),tokens:['CAFE A','NGON']}])
  assert.equal(data.report.duplicates_removed,1)
  assert.equal(data.splits.train.length,0)
  assert.equal(data.splits.test.length,2)
  assert.equal(data.splits.test_template.length,1)
  assert.equal(new Set([...data.splits.test,...data.splits.test_template].map((r)=>r.group_id)).size,1)
})
test('NER does not arbitrarily choose between conflicting annotations',()=>{
  const data=cleanNerDataset([row('Cafe'),{...row('Cafe'),ner_tags:['O','O']}])
  assert.equal(data.report.conflicting_texts,1)
  assert.equal(Object.values(data.splits).flat().length,0)
})
test('real test caption is not demoted to synthetic when its text duplicates a template',()=>{
  const data=cleanNerDataset([row('Cafe'),row('Cafe','test','youtube-real')])
  assert.equal(data.splits.test.length,1)
  assert.equal(data.splits.train.length,0)
})
test('actual NER training data has no case-normalized business, text or video leakage',()=>{
  const {result,output}=prepareNerTraining()
  assert.equal(result.report.cross_partition_business_overlap,0)
  assert.equal(result.report.cross_partition_text_overlap,0)
  assert.equal(result.report.cross_partition_video_overlap,0)
  assert.ok(result.report.duplicates_removed>=16)
  for(const key of ['train','val','test'])assert.ok(result.splits[key].length>0)
  assert.ok(result.splits.val.every((r)=>r.source==='youtube-real'))
  assert.ok(result.splits.test.every((r)=>r.source==='youtube-real'))
  assert.equal(Object.keys(output).length,8)
})
