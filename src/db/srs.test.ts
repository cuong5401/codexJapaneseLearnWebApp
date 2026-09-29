import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './database'
import { SrsRepository } from './repositories/user-data'

const srs = new SrsRepository()
const makeCard = (id: string, state: 'new' | 'review' | 'learning' | 'relearning', nextReviewAt: number) => ({ id, itemType: 'reference-word' as const, itemId: id, cardType: 'recognition', createdAt: 1, lastReviewedAt: null, nextReviewAt, interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0, state })

describe('SRS repository', () => {
  beforeEach(async () => { await db.open(); await Promise.all(db.tables.map((table) => table.clear())) })
  afterEach(async () => { await db.close() })

  it('adds one recognition card for an identity and keeps its first snapshot', async () => {
    const first = await srs.addToReview('custom-word', 'my-word', { word: '推薦', reading: 'すいせん', meaningVi: 'giới thiệu' })
    const again = await srs.addToReview('custom-word', 'my-word', { word: 'changed' })
    expect(first.created).toBe(true)
    expect(again.created).toBe(false)
    expect(await db.srsCards.count()).toBe(1)
    expect(again.card.snapshotWord).toBe('推薦')
  })

  it('commits the scheduled card update and answer log together and counts new cards once', async () => {
    const { card } = await srs.addToReview('reference-word', 'seed', { word: '進捗' })
    await srs.answer(card.id, 1, Date.now(), 1_300)
    expect(await db.srsCards.get(card.id)).toMatchObject({ state: 'learning', lapses: 0 })
    expect(await db.reviewLogs.where('cardId').equals(card.id).count()).toBe(1)
    expect((await srs.counts()).introducedToday).toBe(1)
  })

  it('snapshots a bounded queue with reviews, learning steps, then new cards', async () => {
    const now = Date.now()
    await db.srsCards.bulkPut([makeCard('new', 'new', now), makeCard('review', 'review', now - 100), makeCard('learn', 'learning', now - 50), makeCard('future', 'review', now + 60_000)])
    const queue = await srs.listSessionQueue(now, 1, 10)
    expect(queue.map((card) => card.id)).toEqual(['review', 'learn', 'new'])
  })

  it('suspends and restores a card’s prior state and due time; reset clears only its logs', async () => {
    const { card } = await srs.addToReview('custom-word', 'suspended')
    await srs.answer(card.id, 3, Date.now(), 100)
    const reviewed = (await srs.get(card.id))!
    await srs.addReviewLog({ id: 'older-log', cardId: card.id, reviewedAt: 123, rating: 3, previousInterval: null, newInterval: 1 })
    await srs.setSuspended(card.id, true)
    expect(await srs.get(card.id)).toMatchObject({ state: 'suspended', nextReviewAt: null })
    await srs.setSuspended(card.id, false)
    expect(await srs.get(card.id)).toMatchObject({ state: reviewed.state, nextReviewAt: reviewed.nextReviewAt })
    await srs.reset(card.id)
    expect(await srs.get(card.id)).toMatchObject({ state: 'new', interval: 0, repetitions: 0 })
    expect(await db.reviewLogs.where('cardId').equals(card.id).count()).toBe(0)
  })
})
