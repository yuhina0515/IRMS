// shared/defaults.ts
// --- 預設復健動作範本 ---
// 「還原預設」功能會以此清單重建 custom_actions 資料表的範本動作。

import type { CustomActionInput } from './types'

export const DEFAULT_ACTIONS: CustomActionInput[] = [
  // 膝關節 (Knee)
  {
    name: 'Squat (深蹲屈膝)',
    description: '站姿屈膝至目標角度並維持',
    protocol: 'knee',
    targetAngle: 90,
    tolerance: 10,
    holdTimeMs: 3000,
    triggerType: 'joint_angle',
    safetyLimit: 135
  },
  {
    name: 'Straight Leg Raise (直膝抬腿)',
    description: '保持膝伸直,將大腿抬至目標仰角',
    protocol: 'knee',
    targetAngle: 45,
    tolerance: 10,
    holdTimeMs: 3000,
    triggerType: 'segment_elevation',
    safetyLimit: 80
  },
  {
    name: 'Backward Extension (直膝後擺)',
    description: '保持膝伸直,將大腿向後伸展至目標角度',
    protocol: 'knee',
    targetAngle: 20,
    tolerance: 8,
    holdTimeMs: 2000,
    triggerType: 'segment_extension',
    safetyLimit: 30
  },
  // 肘關節 (Elbow)
  {
    name: 'Elbow Flexion (肘屈曲)',
    description: '前臂彎曲至目標夾角並維持',
    protocol: 'elbow',
    targetAngle: 100,
    tolerance: 12,
    holdTimeMs: 2500,
    triggerType: 'joint_angle',
    safetyLimit: 145
  },
  // 肩關節 (Shoulder)
  {
    name: 'Shoulder Abduction (肩外展)',
    description: '手臂側向抬升至目標仰角',
    protocol: 'shoulder',
    targetAngle: 90,
    tolerance: 15,
    holdTimeMs: 3000,
    triggerType: 'segment_elevation',
    safetyLimit: 160
  }
]
