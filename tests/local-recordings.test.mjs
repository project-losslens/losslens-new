import test from 'node:test'
import assert from 'node:assert/strict'
import { saveLocalRecording } from '../src/lib/localRecordings.js'

class Reader {
  readAsDataURL() { this.result='data:audio/webm;base64,cWE='; queueMicrotask(()=>this.onload()) }
}
test('Full device storage rejects a fallback save',async()=>{
  const previous=globalThis.FileReader;globalThis.FileReader=Reader
  try {await assert.rejects(()=>saveLocalRecording({getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded')}},'owner',new Blob(['qa']),{}),/Quota exceeded/)}
  finally {globalThis.FileReader=previous}
})
test('Local recordings keep separate account keys',async()=>{
  const previous=globalThis.FileReader;globalThis.FileReader=Reader
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)}
  try {
    await saveLocalRecording(storage,'mirror_owner_2026-11',new Blob(['qa']),{userId:'owner'})
    await saveLocalRecording(storage,'mirror_other_2026-11',new Blob(['qa']),{userId:'other'})
    assert.equal(JSON.parse(data.get('mirror_owner_2026-11'))[0].userId,'owner')
    assert.equal(JSON.parse(data.get('mirror_other_2026-11'))[0].userId,'other')
  } finally {globalThis.FileReader=previous}
})
test('Corrupted local recordings are preserved for recovery',async()=>{
  const previous=globalThis.FileReader;globalThis.FileReader=Reader
  let overwritten=false
  try {
    await assert.rejects(()=>saveLocalRecording({getItem:()=>'{invalid',setItem:()=>{overwritten=true}},'owner',new Blob(['qa']),{}))
    assert.equal(overwritten,false)
  } finally {globalThis.FileReader=previous}
})