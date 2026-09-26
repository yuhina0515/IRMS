// Short translated trigger-type names used across v3 views (PROPOSAL §4 Actions): the enum and
// the long bilingual TRIGGER_TYPES labels stay unchanged for storage and editors.
import type { TriggerType } from '@shared/types'

export const TRIGGER_SHORT: Record<TriggerType, string> = {
  joint_angle: '關節角度',
  segment_elevation: '肢段抬高',
  segment_extension: '肢段後伸'
}
