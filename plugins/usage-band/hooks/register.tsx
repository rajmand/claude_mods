import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, [])
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)

const MINUTE = 60_000
const ORDER = ['five_hour', 'seven_day']
const LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: 'week',
  spend_limit: 'spend',
}

const rank = (kind: string) => {
  const at = ORDER.indexOf(kind)

  return at === -1 ? ORDER.length : at
}

const labelOf = (kind: string) => LABELS[kind] ?? kind.replace(/_/g, ' ')

const colorOf = (percent: number) =>
  percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success'

const toLimits = (rateLimits: readonly SessionRateLimit[]): Limit[] =>
  rateLimits
    .map(({ kind, percentUsed, resetsAt }) => ({
      kind,
      percentUsed,
      resetsAt: resetsAt ?? null,
    }))
    .sort((a, b) => rank(a.kind) - rank(b.kind))

const untilReset = (resetsAt: string | null, at: number) => {
  const resets = resetsAt === null ? NaN : Date.parse(resetsAt)

  if (Number.isNaN(resets)) {
    return undefined
  }

  const minutes = Math.max(0, Math.ceil((resets - at) / MINUTE))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60

  if (minutes === 0) return 'now'
  if (days > 0) return `in ${days}d${hours}h`
  if (hours > 0) return `in ${hours}h${rest}m`

  return `in ${rest}m`
}

const barOf = (percent: number, width: number) => {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)

  return ['█'.repeat(filled), '░'.repeat(width - filled)] as const
}

const setLimits = async ($: EngineInterface, rateLimits: readonly SessionRateLimit[]) => {
  const fresh = toLimits(rateLimits)
  const held = await read($, limits)

  if (JSON.stringify(held) !== JSON.stringify(fresh)) {
    await update($, limits, () => fresh)
  }
}

const tick = async ($: EngineInterface) => {
  const at = await $.clock.now()
  await update($, now, () => at)
  await setLimits($, (await $.session.usage()).rateLimits)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await tick($)
    } catch {
      // No reading yet: session.measure fills the band after the first reply.
    }
    $.clock.every(MINUTE, () => void tick($).catch(() => undefined))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await setLimits($, e.rateLimits)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, limits)

    if (e.props.hasSurvey || shown.length === 0) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const at = (await read($, now)) || (await $.clock.now())
    const columns = e.props.bodyColumns
    const width = columns < 50 ? 6 : 12

    return (
      <Box flexDirection={columns < 90 ? 'column' : 'row'} columnGap={4}>
        {shown.map(limit => {
          const color = colorOf(limit.percentUsed)
          const [full, empty] = barOf(limit.percentUsed, width)
          const resets = untilReset(limit.resetsAt, at)

          return (
            <Box key={limit.kind} columnGap={1}>
              <Text bold>{labelOf(limit.kind)}</Text>
              <Text>
                <Text color={color}>{full}</Text>
                <Text dimColor>{empty}</Text>
              </Text>
              <Text color={color}>{Math.round(limit.percentUsed)}%</Text>
              {resets !== undefined && <Text dimColor>· resets {resets}</Text>}
            </Box>
          )
        })}
      </Box>
    )
  })
}
