// Only public caption training data and explicitly allowlisted training files.
// Never packages .env, Supabase credentials, app accounts or precise GPS.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {prepareNerTraining} from './prepare-ner-training.js'

const {root,result,output}=prepareNerTraining()
const target=resolve(root,'ml/colab-package')
mkdirSync(resolve(target,'data'),{recursive:true})
for(const [name,text] of Object.entries(output))writeFileSync(resolve(target,'data',name),text,'utf8')
const files=['ner_preprocessing.py','test_preprocessing.py','check_segmentation.py','check_tokenization.py','train_ner.py','requirements-colab.txt','README.md']
for(const name of files)writeFileSync(resolve(target,name),readFileSync(resolve(root,'ml/training',name)))
console.log(JSON.stringify({output:target,report:result.report},null,2))
