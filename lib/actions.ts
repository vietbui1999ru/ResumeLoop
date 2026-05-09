export const VALID_ACTIONS = [
  '0-Saved',
  '1-Applied',
  '2-Phone Screen',
  '3-Interview',
  '4-Offer',
  '5-Rejected',
  '6-Ghosted',
] as const

export type ActionStage = typeof VALID_ACTIONS[number]
