// downsample.rs — port of shared/downsample.ts's LTTB (Largest-Triangle-Three-Buckets)
// downsampling, used by sessions_repo::get_data's chart-mode path. Picks the most visually
// representative point per bucket by triangle area rather than uniform striding, so a single
// clinically-significant spike (a dangerous over-extension) survives downsampling instead of
// being averaged away between sample points. First and last points are always kept so the time
// axis range never shrinks.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// `data` must already be sorted by x ascending. Returns `data` unchanged if threshold is <= 2
/// or >= data.len() (a "downsample to 2 points" request is degenerate, not meaningful).
pub fn lttb(data: &[Point], threshold: usize) -> Vec<Point> {
    let n = data.len();
    if threshold >= n || threshold <= 2 {
        return data.to_vec();
    }

    let mut sampled = Vec::with_capacity(threshold);
    sampled.push(data[0]);

    // Buckets span indices 1..=n-2 (excluding the fixed first/last points), divided evenly
    // across threshold-2 buckets. Bucket boundaries must start counting from index 1: an
    // off-by-one here degenerates the last bucket to an empty range, landing "chosen" on n-1 and
    // colliding with the fixed last point (mirrors the TS test asserting strictly increasing x).
    let bucket_size = (n - 2) as f64 / (threshold - 2) as f64;
    let mut a = 0usize;

    for i in 0..(threshold - 2) {
        let range_start = (i as f64 * bucket_size).floor() as usize + 1;
        let range_end = (((i + 1) as f64 * bucket_size).floor() as usize + 1).min(n - 1);

        let next_start = range_end;
        let next_end = (((i + 2) as f64 * bucket_size).floor() as usize + 1).min(n);
        let next_len = (next_end.saturating_sub(next_start)).max(1);
        let mut avg_x = 0.0;
        let mut avg_y = 0.0;
        for j in next_start..next_end {
            avg_x += data[j].x;
            avg_y += data[j].y;
        }
        avg_x /= next_len as f64;
        avg_y /= next_len as f64;

        let ax = data[a].x;
        let ay = data[a].y;
        let mut max_area = -1.0;
        let mut chosen = range_start;
        for j in range_start..range_end {
            let area = ((ax - avg_x) * (data[j].y - ay) - (ax - data[j].x) * (avg_y - ay)).abs();
            if area > max_area {
                max_area = area;
                chosen = j;
            }
        }
        sampled.push(data[chosen]);
        a = chosen;
    }

    sampled.push(data[n - 1]);
    sampled
}

#[cfg(test)]
mod tests {
    use super::*;

    fn series(values: &[f64]) -> Vec<Point> {
        values
            .iter()
            .enumerate()
            .map(|(x, &y)| Point { x: x as f64, y })
            .collect()
    }

    #[test]
    fn below_threshold_returns_unchanged() {
        let d = series(&[1.0, 2.0, 3.0]);
        assert_eq!(lttb(&d, 10), d);
        assert_eq!(lttb(&d, 3), d);
    }

    #[test]
    fn threshold_at_or_below_two_does_not_sample() {
        let d = series(&[1.0, 2.0, 3.0, 4.0, 5.0]);
        assert_eq!(lttb(&d, 2), d);
    }

    #[test]
    fn output_length_equals_threshold() {
        let values: Vec<f64> = (0..5000).map(|i| (i as f64 / 50.0).sin() * 90.0).collect();
        let d = series(&values);
        assert_eq!(lttb(&d, 500).len(), 500);
    }

    #[test]
    fn first_and_last_points_always_kept() {
        let values: Vec<f64> = (0..1000).map(|i| i as f64).collect();
        let d = series(&values);
        let out = lttb(&d, 100);
        assert_eq!(out[0], d[0]);
        assert_eq!(*out.last().unwrap(), *d.last().unwrap());
    }

    #[test]
    fn output_x_strictly_increasing() {
        let values: Vec<f64> = (0..3000).map(|i| (i as f64 / 30.0).cos() * 45.0 + 45.0).collect();
        let d = series(&values);
        let out = lttb(&d, 300);
        for i in 1..out.len() {
            assert!(out[i].x > out[i - 1].x);
        }
    }

    #[test]
    fn preserves_an_isolated_spike() {
        // A flat line with one spike in the middle (a single dangerous over-extension) — this is
        // exactly the clinical signal that matters.
        let mut values = vec![10.0; 2000];
        values[977] = 165.0;
        let d = series(&values);
        let out = lttb(&d, 200);
        assert!(out.iter().any(|p| p.y == 165.0));
    }

    #[test]
    fn lttb_catches_a_spike_uniform_striding_would_miss() {
        let mut values = vec![10.0; 2000];
        values[977] = 165.0;
        let d = series(&values);
        let stride = (2000f64 / 200.0).ceil() as usize;
        let uniform: Vec<Point> = d.iter().step_by(stride).copied().collect();
        assert!(!uniform.iter().any(|p| p.y == 165.0)); // 977 % 10 != 0
        assert!(lttb(&d, 200).iter().any(|p| p.y == 165.0));
    }

    #[test]
    fn preserves_multiple_spikes() {
        let mut values = vec![5.0; 4000];
        for &i in &[301usize, 1123, 2517, 3733] {
            values[i] = 120.0 + (i % 7) as f64;
        }
        let d = series(&values);
        let out = lttb(&d, 400);
        for &i in &[301.0, 1123.0, 2517.0, 3733.0] {
            assert!(out.iter().any(|p| p.x == i));
        }
    }
}
