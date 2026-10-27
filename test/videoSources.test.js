import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCaption, spokenNames, spokenAddress, venueHashtags, commentAddress } from '../supabase/functions/_shared/captionSignals.js'
import { parseComments, visionText } from '../supabase/functions/_shared/videoPage.js'

const SPEECH = 'ở đây thì chuyên về lẩu với nướng chị gọi luôn nguyên cái combo á quán nhà kho này nằm ở đường lái thiêu 97 ở đây từ không gian cho tới món ăn'

test('hears a venue named in passing, and an address said aloud', () => {
  assert.deepEqual(spokenNames(SPEECH), ['nhà kho'])
  assert.deepEqual(spokenNames('quán lẩu nướng này ngon lắm, quán này mình đi hoài, nhà hàng này đẹp'), [], 'kinds of food are not names')
  assert.deepEqual(spokenNames('ghé quán Bếp Mây ở đường Nguyễn Huệ nha'), ['Bếp Mây'])
  assert.equal(spokenAddress(SPEECH), '97 lái thiêu')
  assert.equal(spokenAddress('quán nằm ở số 12 đường Nguyễn Huệ quận 1'), '12 Nguyễn Huệ')
  assert.equal(spokenAddress('ngon lắm luôn đó mọi người'), null)
})

test('hashtags that could be a name, and confirm one', () => {
  assert.deepEqual(venueHashtags('Khu vườn #diiubinhduong #reviewbinhduong #nhakho #fyp #binhduong', { author: 'diiubinhduong' }), ['nhakho'])
  const r = analyzeCaption('Khu vườn thu nhỏ ở Bình Dương nè #diiubinhduong #reviewbinhduong #nhakho', { spoken: SPEECH, author: 'diiubinhduong' })
  assert.deepEqual(r.names, ['nhà kho'])
  assert.deepEqual(r.queries, ['nhà kho, 97 lái thiêu, Bình Dương'])
})

const COMMENTS = {
  comments: [
    { text: 'Xin địa chỉ vs ạ', user: { unique_id: 'a' }, reply_comment: [{ text: 'Da. Lai thieu 97. Phường Lái Thiêu', user: { unique_id: 'shop' } }] },
    { text: 'Ăn đồ Nhật mọi người ghé bên em số 2 Huỳnh Thúc Kháng, TDM', user: { unique_id: 'b' } },
    { text: 'Quán Bò Sốt Cay 99 ở đường Bạch Đằng cũng rất ngon', user: { unique_id: 'c' } },
    { text: 'Đẹp quá nè mn, như khu vườn thu nhỏ vậy á', user: { unique_id: 'creator' } },
  ],
}

test('keeps only the creator\'s comments and answers to "where is it"', () => {
  const kept = parseComments(COMMENTS, 'creator')
  assert.deepEqual(kept, [
    { text: 'Da. Lai thieu 97. Phường Lái Thiêu', answer: true, by: 'viewer' },
    { text: 'Đẹp quá nè mn, như khu vườn thu nhỏ vậy á', answer: false, by: 'creator' },
  ])
  assert.equal(commentAddress(kept), 'Lai thieu 97. Phường Lái Thiêu')
  // A viewer advertising another place is not the venue's address.
  assert.equal(commentAddress([{ text: 'ghé bên em số 2 Huỳnh Thúc Kháng', answer: false, by: 'viewer' }]), null)
  // Without the speech, the answer gives the address and the hashtag the name.
  const r = analyzeCaption('Khu vườn thu nhỏ ở Bình Dương nè #diiubinhduong #nhakho', { comments: kept, author: 'creator' })
  assert.deepEqual(r.queries, ['nhakho, Lai thieu 97. Phường Lái Thiêu, Bình Dương'])
})

test('reads text written on pictures (Cloud Vision) like a title or a list', () => {
  assert.equal(visionText({ responses: [{ fullTextAnnotation: { text: 'NHÀ KHO\nLẨU & NƯỚNG' } }, {}, { textAnnotations: [{ description: 'Lái Thiêu 97' }] }] }), 'NHÀ KHO\nLẨU & NƯỚNG\n\nLái Thiêu 97')
  assert.equal(visionText({ error: { code: 403 } }), '')
  const r = analyzeCaption('LIST QUÁN ĂN TẠI BÌNH DƯƠNG', { screen: '1. BÒ SỐT CAY 99 - 12 Bạch Đằng, Thủ Dầu Một\n2. Chicken Talk - 45 Yersin, Thủ Dầu Một' })
  // Thủ Dầu Một is in Bình Dương: the address already says where.
  assert.deepEqual(r.queries, ['BÒ SỐT CAY 99, 12 Bạch Đằng, Thủ Dầu Một', 'Chicken Talk, 45 Yersin, Thủ Dầu Một'])
})
