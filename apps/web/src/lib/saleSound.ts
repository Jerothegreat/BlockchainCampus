import type { ReceiptResult } from './api'

let audio: AudioContext | undefined

/** Call during a tap so browsers allow audio after the asynchronous payment. */
export function prepareSaleSound() {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined)
  } catch {
    // Audio is optional: unsupported or blocked audio must never interrupt a sale.
  }
}

/** A short, metallic two-strike cash-register chime, generated locally for offline use. */
export async function playSaleSound(status: ReceiptResult['status']) {
  if (status !== 'pending' && status !== 'settled') return
  try {
    if (!audio) return
    if (audio.state === 'suspended') await audio.resume()
    if (audio.state !== 'running') return

    const start = audio.currentTime
    for (const [delay, pitch] of [[0, 1600], [0.12, 2200]]) {
      for (const [ratio, volume] of [[1, 0.12], [1.5, 0.045], [2.76, 0.02]]) {
        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        const at = start + delay
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(pitch * ratio, at)
        gain.gain.setValueAtTime(0, at)
        gain.gain.linearRampToValueAtTime(volume, at + 0.004)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45)
        oscillator.connect(gain)
        gain.connect(audio.destination)
        oscillator.onended = () => {
          oscillator.disconnect()
          gain.disconnect()
        }
        oscillator.start(at)
        oscillator.stop(at + 0.46)
      }
    }
  } catch {
    // A muted device or audio failure must not change the payment result.
  }
}
