import type { AudioKind, AudioSettingsView } from './model'
import { audioSettingsSchema } from './model'

export const kindSettingKeys = {
  narration: ['narrationEnabled', 'narrationResource', 'narrationSpeaker', 'dailyNarrationCharacters'],
  podcast: ['podcastEnabled', 'podcastResource', 'podcastSpeaker1', 'podcastSpeaker2', 'dailyPodcasts'],
} as const
export function audioSettingsForKind(saved: AudioSettingsView, form: AudioSettingsView, kind: AudioKind) {
  const other = kindSettingKeys[kind === 'narration' ? 'podcast' : 'narration'] as readonly string[]
  return audioSettingsSchema.parse(Object.fromEntries(Object.keys(audioSettingsSchema.shape).map(key => [key, (other.includes(key) ? saved : form)[key as keyof AudioSettingsView]])))
}
export function acceptAudioSettings(form: AudioSettingsView, saved: AudioSettingsView, kind: AudioKind): AudioSettingsView {
  return { ...saved, ...Object.fromEntries(kindSettingKeys[kind === 'narration' ? 'podcast' : 'narration'].map(key => [key, form[key]])) }
}
