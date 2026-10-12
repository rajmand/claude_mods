import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'

const NOW = Date.parse('2026-10-12T10:00:00Z')
const MINUTE = 60_000
const SURFACES = ['terminal', 'desktop'] as const

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}

const resetsIn = (minutes: number) => new Date(NOW + minutes * MINUTE).toISOString()

const LIMITS: SessionRateLimit[] = [
  { kind: 'seven_day', percentUsed: 94, resetsAt: resetsIn(12 * 60 + 15) },
  { kind: 'five_hour', percentUsed: 3, resetsAt: resetsIn(4 * 60 + 35) },
]

const engine = (on: On, rateLimits: () => SessionRateLimit[]) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: rateLimits() },
  }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine-band" />
  })

  return clock
}

const START = { cwd: '/work', surface: 'terminal', isInteractive: true } as const

describe('usage band', () => {
  test('draws 5h then week, with percent, color and countdown', async ($, on) => {
    engine(on, () => LIMITS)
    await $.session.start(START)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'usage-band', surface, component: 'AbovePrompt', props: PROPS })
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      const joined = texts.join('|')

      expect(joined.indexOf('5h')).toBeLessThan(joined.indexOf('week'))
      expect(texts).toContain('3%')
      expect(texts).toContain('94%')
      expect(texts).toContain('· resets in 4h35m')
      expect(texts).toContain('· resets in 12h15m')
      expect((await ui.find({ type: 'Text', text: '3%' }))?.props.color).toBe('success')
      expect((await ui.find({ type: 'Text', text: '94%' }))?.props.color).toBe('error')
      await ui.unmount()
    }
  })

  test('the countdown moves each minute', async ($, on) => {
    const clock = engine(on, () => LIMITS)
    await $.session.start(START)
    await clock.advance(MINUTE)

    const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    expect(await ui.find({ type: 'Text', text: '· resets in 4h34m' })).toBeDefined()
  })

  test('a measurement redraws the band', async ($, on) => {
    engine(on, () => LIMITS)
    await $.session.start(START)
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 61.5, resetsAt: resetsIn(30) }],
      changed: ['rateLimits'],
    })

    const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
    const pct = await ui.find({ type: 'Text', text: '62%' })
    expect(pct?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: '· resets in 30m' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'week' })).toBeUndefined()
  })

  test('nothing is drawn before the first reading', async ($, on) => {
    engine(on, () => [])
    await $.session.start(START)

    const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    expect(await ui.find({ key: 'engine-band' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '%' })).toBeUndefined()
  })
})
