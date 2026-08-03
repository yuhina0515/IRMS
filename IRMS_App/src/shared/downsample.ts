// shared/downsample.ts
// --- LTTB (Largest-Triangle-Three-Buckets) 抽樣 ---
//
// 2026-08-01 會議意見清單 #14:sessionsRepo.getData 無上限。25Hz × 10 分鐘 ≈ 15,000 列,
// 整包經 structured-clone 過 IPC,再為每一點跑一次 toLocaleTimeString(Intl 呼叫),
// 然後餵給 Chart.js 三個 15k 元素的陣列——分析視窗會肉眼可見地卡住。
//
// 為什麼用 LTTB 而不是均勻取樣:復健資料的臨床意義集中在「峰值」——這一下抬到幾度、
// 有沒有超過安全上限。均勻取樣會直接錯過落在取樣點之間的峰,把一次危險的超伸抹平成
// 看起來正常的曲線。LTTB 以三角形面積挑選每個桶內最具代表性的點,峰谷會被保留。
//
// 首尾點一律保留,時間軸範圍才不會縮水。

export interface Point {
  /** x 軸(時間戳的毫秒值) */
  x: number
  /** y 軸(要抽樣的指標值) */
  y: number
}

/**
 * @param data 已依 x 遞增排序的資料點
 * @param threshold 目標點數;<= 2 或大於等於原資料長度時原樣回傳
 */
export function lttb<T extends Point>(data: T[], threshold: number): T[] {
  const n = data.length
  if (threshold >= n || threshold <= 2) return data

  const sampled: T[] = [data[0]] // 首點固定保留
  // 扣掉首尾之後,剩下的 n-2 個點(索引 1 … n-2)平均分進 threshold-2 個桶。
  // 桶邊界必須從索引 1 起算:若整體偏移一格,最後一個桶會退化成空區間,
  // chosen 落在 n-1 而與固定保留的尾點重複(單元測試「輸出維持 x 遞增」即為此而設)。
  const bucketSize = (n - 2) / (threshold - 2)
  let a = 0 // 上一個被選中的點的索引

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor(i * bucketSize) + 1
    const rangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n - 1)

    // 下一個桶的平均點,作為三角形的第三頂點;最後一個桶時退化為尾點本身
    const nextStart = rangeEnd
    const nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n)
    let avgX = 0
    let avgY = 0
    const nextLen = Math.max(1, nextEnd - nextStart)
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += data[j].x
      avgY += data[j].y
    }
    avgX /= nextLen
    avgY /= nextLen

    // 在本桶內挑出與 (前一選中點, 下一桶平均點) 圍成三角形面積最大的點
    let maxArea = -1
    let chosen = rangeStart
    const ax = data[a].x
    const ay = data[a].y
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((ax - avgX) * (data[j].y - ay) - (ax - data[j].x) * (avgY - ay))
      if (area > maxArea) {
        maxArea = area
        chosen = j
      }
    }
    sampled.push(data[chosen])
    a = chosen
  }

  sampled.push(data[n - 1]) // 尾點固定保留
  return sampled
}
