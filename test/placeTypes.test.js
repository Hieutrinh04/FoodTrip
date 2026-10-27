import test from 'node:test'
import assert from 'node:assert/strict'

import { isWantedPlace } from '../src/lib/placeTypes.js'

test('food searches keep places typed as food and drop the rest', () => {
  assert.equal(isWantedPlace(['point_of_interest', 'restaurant', 'food_and_drink'], 'Quán Ăn Anh Mập'), true)
  assert.equal(isWantedPlace(['point_of_interest', 'bubble_tea_store', 'food_and_drink'], 'Trà sữa'), true)
  assert.equal(isWantedPlace(['point_of_interest', 'electronics_store', 'shopping'], 'CH ĐTDĐ Quang Anh'), false)
  assert.equal(isWantedPlace(['administrative_area_level_3', 'political'], 'Phường Phú Lợi'), false)
  assert.equal(isWantedPlace(['point_of_interest', 'general_contractor'], 'NHÀ ĐẸP VIỆT - Kiến trúc & Xây dựng'), false)
})

test('an untyped result counts only when its name says it serves food', () => {
  assert.equal(isWantedPlace([], 'Quán Bún Bò Huế'), true)
  assert.equal(isWantedPlace([], 'Phường Phú Lợi'), false)
})

test('attraction searches keep only places to visit', () => {
  assert.equal(isWantedPlace(['tourist_attraction', 'point_of_interest'], 'Chùa Cầu', 'attraction'), true)
  assert.equal(isWantedPlace(['restaurant'], 'Quán Ăn 77', 'attraction'), false)
})
