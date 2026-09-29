import { describe, expect, it } from 'vitest'
import type { SrsCard } from '../../types/domain'
import { localDayBounds, scheduleAnswer } from './scheduler'

const fresh = (state: SrsCard['state'] = 'new', overrides: Partial<SrsCard> = {}): SrsCard => ({
  id: 'reference-word:語:recognition', itemType: 'reference-word', itemId: '語', cardType: 'recognition', createdAt: 0,
  lastReviewedAt: null, nextReviewAt: 0, interval: 0, easeFactor: 2.5, repetitions: 0, lapses: 0, state, ...overrides,
})

describe('review scheduler', () => {
  it('records New Again as a ten-minute learning step and marks the durable introduction', () => {
    const { card, log } = scheduleAnswer(fresh(), 1, 1_000)
    expect(card).toMatchObject({ state: 'learning', nextReviewAt: 601_000, lapses: 0 })
    expect(log).toMatchObject({ rating: 1, wasNew: true, previousInterval: null, newInterval: 0 })
  })

  it('graduates New Good to a one-day review and Easy to four days', () => {
    expect(scheduleAnswer(fresh(), 3, 0).card).toMatchObject({ state: 'learning', nextReviewAt: 86_400_000 })
    expect(scheduleAnswer(fresh(), 4, 0).card).toMatchObject({ state: 'review', interval: 4, nextReviewAt: 345_600_000, easeFactor: 2.65 })
  })

  it('applies SM-2 inspired review intervals and lapse relearning', () => {
    const card = fresh('review', { interval: 6, repetitions: 1, easeFactor: 2.5 })
    expect(scheduleAnswer(card, 3, 100).card).toMatchObject({ state: 'review', interval: 6, repetitions: 2 })
    expect(scheduleAnswer(card, 1, 100).card).toMatchObject({ state: 'relearning', lapses: 1, nextReviewAt: 600_100, easeFactor: 2.3 })
  })

  it('clamps the ease factor and maximum interval', () => {
    const card = fresh('review', { interval: 36_500, repetitions: 10, easeFactor: 2.99 })
    expect(scheduleAnswer(card, 4, 0).card).toMatchObject({ interval: 36_500, easeFactor: 3 })
    expect(scheduleAnswer({ ...card, easeFactor: 1.31 }, 1, 0).card.easeFactor).toBe(1.3)
  })

  it('uses local calendar boundaries that naturally handle daylight-saving day lengths', () => {
    const now = new Date(2026, 8, 28, 12).getTime()
    const { start, end } = localDayBounds(now)
    expect(new Date(start).getHours()).toBe(0)
    expect(new Date(end + 1).getDate()).not.toBe(new Date(start).getDate())
    expect(end - start + 1).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000)
    expect(end - start + 1).toBeLessThanOrEqual(25 * 60 * 60 * 1000)
  })
})
