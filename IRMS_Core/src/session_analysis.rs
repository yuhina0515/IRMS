//! Summary statistics for one recorded session (the History review): how far the limb moved, how
//! much of the time was inside the target zone, how long the knee was past the user's comfort
//! angle and limit.
//!
//! Port of `IRMS_App_Tauri/src/services/sessionAnalysis.ts` (plan phase 4). Always computed on
//! the full readings, never on the chart's LTTB-downsampled data: LTTB keeps peaks but not the
//! distribution over time, so an in-zone ratio taken from it would lean toward the extremes.
//!
//! Difference from the TypeScript: the optional analyser supplied by a runtime module
//! (`moduleFeatures.sessionAnalyzer`) is not ported; this is the built-in calculation only. The
//! module system has no design yet for an interface without a WebView (plan decision D2).

use crate::judge::{AngleLimits, MetricZone};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MetricPoint {
    /// Epoch ms.
    pub t: f64,
    /// The metric value judged in this session; `None` when missing (old data, no reading).
    pub v: Option<f64>,
    /// Knee angle; comfort and limit are always compared with it, as in the judging engine.
    pub k: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SessionAnalysis {
    /// Measured time in seconds, without gaps from disconnects.
    pub active_sec: f64,
    pub peak: Option<f64>,
    /// Time-weighted mean.
    pub mean: Option<f64>,
    /// Share of the measured time spent inside the target zone (0..1); `None` without a zone.
    pub in_zone_ratio: Option<f64>,
    /// Times the knee went past the limit (inside -> past counts once); 0 without a limit.
    pub over_limit_events: u32,
    pub over_limit_sec: f64,
    /// Seconds past the comfort angle; `None` when the session has no comfort angle.
    pub over_comfort_sec: Option<f64>,
}

/// Two readings further apart than this are a disconnect or pause and count for no time: at 25 Hz
/// the normal spacing is 40 ms, so one second is 25 missing packets, not sampling jitter.
pub const MAX_SAMPLE_GAP_MS: f64 = 1000.0;

/// Each reading stands for the time until the next one; `None` when that span must not be counted.
fn span(t: f64, next_t: f64) -> Option<f64> {
    let dt = next_t - t;
    (dt > 0.0 && dt <= MAX_SAMPLE_GAP_MS).then_some(dt)
}

pub fn analyze_session(
    points: &[MetricPoint],
    zone: Option<&MetricZone>,
    limits: &AngleLimits,
) -> SessionAnalysis {
    // Target-zone statistics on the judged metric.
    let valid: Vec<(f64, f64)> = points
        .iter()
        .filter_map(|p| Some((p.t, p.v.filter(|v| v.is_finite())?)))
        .collect();
    let (mut active_ms, mut in_zone_ms, mut weighted_sum) = (0.0, 0.0, 0.0);
    let mut peak: Option<f64> = None;
    for (i, &(t, v)) in valid.iter().enumerate() {
        if peak.is_none_or(|p| v > p) {
            peak = Some(v);
        }
        // The last reading has no next one and counts for no time.
        let Some(dt) = valid.get(i + 1).and_then(|next| span(t, next.0)) else {
            continue;
        };
        active_ms += dt;
        weighted_sum += v * dt;
        if zone.is_some_and(|z| v >= z.min && v <= z.max) {
            in_zone_ms += dt;
        }
    }

    // Knee angle against the personal comfort angle and limit, kept separate from the zone statistics.
    let knees: Vec<(f64, f64)> = points
        .iter()
        .filter_map(|p| Some((p.t, p.k.filter(|k| k.is_finite())?)))
        .collect();
    let (mut events, mut over_ms, mut comfort_ms) = (0u32, 0.0, 0.0);
    let mut was_over = false;
    for (i, &(t, k)) in knees.iter().enumerate() {
        let over = limits.limit.is_some_and(|limit| k > limit);
        if over && !was_over {
            events += 1;
        }
        was_over = over;
        let Some(dt) = knees.get(i + 1).and_then(|next| span(t, next.0)) else {
            continue;
        };
        if over {
            over_ms += dt;
        }
        if limits.comfort.is_some_and(|comfort| k > comfort) {
            comfort_ms += dt;
        }
    }

    SessionAnalysis {
        active_sec: active_ms / 1000.0,
        peak,
        mean: (active_ms > 0.0).then(|| weighted_sum / active_ms),
        in_zone_ratio: (zone.is_some() && active_ms > 0.0).then(|| in_zone_ms / active_ms),
        over_limit_events: events,
        over_limit_sec: over_ms / 1000.0,
        over_comfort_sec: limits.comfort.map(|_| comfort_ms / 1000.0),
    }
}

#[cfg(test)]
mod tests {
    //! Ported from sessionAnalysis.test.ts.
    use super::*;

    const ZONE: MetricZone = MetricZone {
        min: 80.0,
        max: 100.0,
        rest: 40.0,
    };
    const NONE: AngleLimits = AngleLimits {
        comfort: None,
        limit: None,
    };

    /// Continuous 25 Hz sampling.
    fn series(values: &[Option<f64>], start: f64) -> Vec<MetricPoint> {
        values
            .iter()
            .enumerate()
            .map(|(i, v)| MetricPoint {
                t: start + i as f64 * 40.0,
                v: *v,
                k: None,
            })
            .collect()
    }
    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-6
    }

    #[test]
    fn time_weighted_zone_ratio_mean_and_peak() {
        // 10 readings at 0 then 11 at 90: half the time in the zone (the last reading counts for no time).
        let mut values = vec![Some(0.0); 10];
        values.extend(vec![Some(90.0); 11]);
        let a = analyze_session(&series(&values, 0.0), Some(&ZONE), &NONE);
        assert!(close(a.active_sec, 0.8));
        assert!(close(a.in_zone_ratio.unwrap(), 0.5));
        assert!(close(a.mean.unwrap(), 45.0));
        assert_eq!(a.peak, Some(90.0));
        assert_eq!(a.over_limit_events, 0);
    }

    #[test]
    fn each_crossing_of_the_limit_counts_once_and_comfort_time_is_separate() {
        let knees = [90.0, 140.0, 140.0, 90.0, 140.0, 90.0];
        let mut points = series(&knees.map(Some), 0.0);
        for (p, k) in points.iter_mut().zip(knees) {
            p.k = Some(k);
        }
        let limits = AngleLimits {
            comfort: Some(85.0),
            limit: Some(135.0),
        };
        let a = analyze_session(&points, Some(&ZONE), &limits);
        assert_eq!(a.over_limit_events, 2);
        assert!(close(a.over_limit_sec, 0.12));
        assert!(close(a.over_comfort_sec.unwrap(), 0.2));
    }

    #[test]
    fn without_a_personal_range_nothing_is_counted_as_exceeded() {
        let mut points = series(&[Some(90.0), Some(170.0), Some(90.0)], 0.0);
        for p in &mut points {
            p.k = p.v;
        }
        let a = analyze_session(&points, Some(&ZONE), &NONE);
        assert_eq!(a.over_limit_events, 0);
        assert_eq!(a.over_comfort_sec, None);
    }

    #[test]
    fn a_disconnect_gap_counts_for_no_time() {
        let mut points = series(&[Some(90.0), Some(90.0)], 0.0);
        points.extend(series(
            &[Some(90.0), Some(90.0)],
            40.0 + MAX_SAMPLE_GAP_MS + 1.0,
        ));
        let a = analyze_session(&points, Some(&ZONE), &NONE);
        assert!(close(a.active_sec, 0.08));
        assert_eq!(a.in_zone_ratio, Some(1.0));
    }

    #[test]
    fn no_zone_means_no_ratio_and_missing_values_are_skipped() {
        let a = analyze_session(
            &series(&[None, Some(10.0), Some(20.0), None], 0.0),
            None,
            &NONE,
        );
        assert_eq!(a.in_zone_ratio, None);
        assert_eq!(a.peak, Some(20.0));
    }

    #[test]
    fn empty_data_gives_no_nan() {
        let a = analyze_session(&[], Some(&ZONE), &NONE);
        assert_eq!(
            (
                a.active_sec,
                a.peak,
                a.mean,
                a.in_zone_ratio,
                a.over_limit_events
            ),
            (0.0, None, None, None, 0)
        );
    }
}
