import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function setup() {
  const start = vi.fn()
  const audio = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => ({
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(), disconnect: vi.fn(), start, stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(), disconnect: vi.fn(),
    })),
  }
  vi.stubGlobal('AudioContext', class { constructor() { return audio } })
  const sound = await import('./saleSound')
  sound.prepareSaleSound()
  return { ...sound, audio, start }
}

describe('sale sound', () => {
  it.each(['pending', 'settled'] as const)('plays for a %s sale', async (status) => {
    const { playSaleSound, start } = await setup()
    await playSaleSound(status)
    expect(start).toHaveBeenCalled()
  })

  it.each(['failed', 'rejected'] as const)('keeps a %s sale silent', async (status) => {
    const { playSaleSound, start } = await setup()
    await playSaleSound(status)
    expect(start).not.toHaveBeenCalled()
  })

  it('absorbs browser autoplay rejection', async () => {
    const { prepareSaleSound, playSaleSound, audio, start } = await setup()
    audio.state = 'suspended'
    audio.resume.mockRejectedValue(new Error('Audio blocked'))
    expect(() => prepareSaleSound()).not.toThrow()
    await expect(playSaleSound('pending')).resolves.toBeUndefined()
    expect(start).not.toHaveBeenCalled()
  })

  it('allows payment to continue when audio is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const { prepareSaleSound, playSaleSound } = await import('./saleSound')
    expect(() => prepareSaleSound()).not.toThrow()
    await expect(playSaleSound('settled')).resolves.toBeUndefined()
  })
})
