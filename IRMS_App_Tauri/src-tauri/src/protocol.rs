// protocol.rs — port of IRMS_App's shared/protocol.ts. This is the wire contract between the
// app and IRMS_Sensor.ino; any change here must be mirrored on the firmware side and in the
// still-shipping Electron app's copy until/unless that's retired.
//
// Unlike ble.rs, this module has zero hardware dependency — parse_angle_packet is a pure
// function, fully testable without a real device. The #[cfg(test)] block below mirrors
// shared/protocol.test.ts's cases 1:1 so the two implementations can be checked against the
// same expectations.

use serde::Serialize;
use std::collections::HashMap;

pub const DEVICE_NAME_PREFIX: &str = "IRMS";
pub const SERVICE_UUID: &str = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
pub const CHAR_ANGLE_TX: &str = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
pub const CHAR_PROFILE_RX: &str = "beb5483f-36e1-4688-b7f5-ea07361b26a8";

pub const OTA_SERVICE_UUID: &str = "4fafc201-1fb5-459e-8fcc-c5c9c3319150";
pub const CHAR_OTA_CONTROL: &str = "beb5483e-36e1-4688-b7f5-ea07361b28a8";
pub const CHAR_OTA_DATA: &str = "beb5483f-36e1-4688-b7f5-ea07361b28a8";
pub const CHAR_OTA_STATUS: &str = "beb54840-36e1-4688-b7f5-ea07361b28a8";
pub const CHAR_FW_VERSION: &str = "beb54841-36e1-4688-b7f5-ea07361b28a8";

/// Aligned to the firmware's config.h BLE_MTU(128) minus the 3-byte ATT header — same number,
/// same reasoning as OTA_CHUNK_SIZE in bluetooth.ts.
pub const OTA_CHUNK_SIZE: usize = 125;
/// Throttle between chunks (Write Without Response has no ATT-layer ack; too fast overflows the
/// firmware's BLE send queue). This exact value is one of the two things the 2026-09-07 Tauri
/// meeting flagged as needing re-validation against real hardware — it was empirically tuned
/// against the current Web Bluetooth path, not derived, and there's no guarantee it still holds
/// through btleplug's WinRT backend.
pub const OTA_CHUNK_DELAY_MS: u64 = 8;

const ERROR_PREFIX: &str = "ERR:";
/// Order matters: longer TR/SR/KR must be checked before T:/S:/K:, or "T:" would match inside "TR:".
const FIELD_PREFIXES: [&str; 6] = ["TR:", "SR:", "KR:", "T:", "S:", "K:"];

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawAngles {
    pub thigh: f64,
    pub shin: f64,
    pub thigh_roll: f64,
    pub shin_roll: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ParsedPacket {
    #[serde(rename = "angles")]
    Angles {
        raw: RawAngles,
        has_roll: bool,
        truncated: bool,
    },
    #[serde(rename = "error")]
    Error { code: String },
    #[serde(rename = "malformed")]
    Malformed { value: String },
}

fn malformed(trimmed: &str) -> ParsedPacket {
    ParsedPacket::Malformed {
        value: trimmed.to_string(),
    }
}

/// Parses one ESP32 angle-notification packet.
/// Normal: `T:12.5,S:-45.2,K:57.7` (may include TR/SR/KR coronal-plane fields)
/// Error: `ERR:1`
/// Legacy: bare number (knee angle only)
///
/// Degrades per-axis instead of discarding the whole packet on MTU truncation — see
/// shared/protocol.ts's parseAnglePacket doc comment for the full reasoning (issue #2). This is
/// a straight port; the truncation/hasRoll semantics must stay identical to that implementation.
pub fn parse_angle_packet(value: &str) -> ParsedPacket {
    let trimmed = value.trim();

    if trimmed.starts_with(ERROR_PREFIX) {
        return ParsedPacket::Error {
            code: trimmed.to_string(),
        };
    }

    let parts: Vec<&str> = trimmed.split(',').collect();
    if parts.len() < 3 {
        return match trimmed.parse::<f64>() {
            Ok(knee) if !trimmed.is_empty() && knee.is_finite() => ParsedPacket::Angles {
                raw: RawAngles {
                    thigh: 0.0,
                    shin: knee,
                    thigh_roll: 0.0,
                    shin_roll: 0.0,
                },
                has_roll: false,
                truncated: false,
            },
            _ => malformed(trimmed),
        };
    }

    let mut field: HashMap<&str, f64> = HashMap::new();
    let mut truncated = false;
    let last_idx = parts.len() - 1;

    for (i, part) in parts.iter().enumerate() {
        let prefix = FIELD_PREFIXES.iter().find(|p| part.starts_with(**p));
        let raw_value = prefix.map(|p| &part[p.len()..]).unwrap_or("");
        // Empty string must be rejected explicitly: unlike JS's `Number('')` (which is 0, not
        // NaN), Rust's `"".parse::<f64>()` already errors — but keep the check anyway so this
        // stays an obvious 1:1 mirror of the TS source rather than relying on that difference.
        let n = raw_value.parse::<f64>().ok().filter(|v| v.is_finite());
        let bad = prefix.is_none()
            || prefix.is_some_and(|p| field.contains_key(p))
            || raw_value.trim().is_empty()
            || n.is_none();

        if bad {
            // Only the LAST field going bad can be a truncation; mid-packet garbage means this
            // isn't a truncated-but-otherwise-valid packet at all.
            if i == last_idx {
                truncated = true;
                break;
            }
            return malformed(trimmed);
        }
        field.insert(prefix.unwrap(), n.unwrap());
    }

    // T/S feed the trigger engine — missing either is a hard reject, not a degrade.
    let thigh = match field.get("T:") {
        Some(v) => *v,
        None => return malformed(trimmed),
    };
    let shin = match field.get("S:") {
        Some(v) => *v,
        None => return malformed(trimmed),
    };

    // A lone TR or SR is meaningless (firmware always sends both or neither) — drop it and mark
    // truncated rather than using it to compute a varus/valgus reading.
    let thigh_roll_raw = field.get("TR:").copied();
    let shin_roll_raw = field.get("SR:").copied();
    let has_roll = thigh_roll_raw.is_some() && shin_roll_raw.is_some();
    if !has_roll && (thigh_roll_raw.is_some() || shin_roll_raw.is_some()) {
        truncated = true;
    }

    ParsedPacket::Angles {
        raw: RawAngles {
            thigh,
            shin,
            thigh_roll: if has_roll { thigh_roll_raw.unwrap() } else { 0.0 },
            shin_roll: if has_roll { shin_roll_raw.unwrap() } else { 0.0 },
        },
        has_roll,
        truncated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn angles(p: &ParsedPacket) -> (RawAngles, bool, bool) {
        match p {
            ParsedPacket::Angles {
                raw,
                has_roll,
                truncated,
            } => (*raw, *has_roll, *truncated),
            other => panic!("expected Angles, got {other:?}"),
        }
    }

    #[test]
    fn full_six_axis_packet_ignores_derived_k_kr() {
        let p = parse_angle_packet("T:12.5,S:-45.2,K:57.7,TR:1.2,SR:-0.8,KR:2.0");
        let (raw, ..) = angles(&p);
        assert_eq!(
            raw,
            RawAngles {
                thigh: 12.5,
                shin: -45.2,
                thigh_roll: 1.2,
                shin_roll: -0.8
            }
        );
    }

    #[test]
    fn legacy_three_field_packet_zeroes_roll() {
        let p = parse_angle_packet("T:10.0,S:20.0,K:10.0");
        let (raw, ..) = angles(&p);
        assert_eq!(
            raw,
            RawAngles {
                thigh: 10.0,
                shin: 20.0,
                thigh_roll: 0.0,
                shin_roll: 0.0
            }
        );
    }

    #[test]
    fn tr_sr_prefixes_not_swallowed_by_t_s() {
        let p = parse_angle_packet("TR:5.5,SR:6.6,T:1.1,S:2.2,K:1.1");
        let (raw, ..) = angles(&p);
        assert_eq!(raw.thigh, 1.1);
        assert_eq!(raw.thigh_roll, 5.5);
        assert_eq!(raw.shin_roll, 6.6);
    }

    #[test]
    fn err_packet_reports_hardware_error_code() {
        let p = parse_angle_packet("ERR:1");
        assert_eq!(
            p,
            ParsedPacket::Error {
                code: "ERR:1".to_string()
            }
        );
    }

    #[test]
    fn trailing_whitespace_still_parses() {
        let p = parse_angle_packet("  ERR:1\n");
        assert!(matches!(p, ParsedPacket::Error { .. }));
    }

    #[test]
    fn invalid_number_is_malformed() {
        let p = parse_angle_packet("T:abc,S:1.0,K:2.0");
        assert!(matches!(p, ParsedPacket::Malformed { .. }));
    }

    #[test]
    fn bare_number_legacy_firmware_carried_on_shin() {
        let p = parse_angle_packet("45.5");
        let (raw, ..) = angles(&p);
        assert_eq!(raw.shin, 45.5);
        assert_eq!(raw.thigh, 0.0);
    }

    #[test]
    fn unparseable_string_is_malformed() {
        assert!(matches!(
            parse_angle_packet("hello"),
            ParsedPacket::Malformed { .. }
        ));
    }

    mod mtu_23_truncation {
        use super::*;

        const FULL: &str = "T:-180.0,S:-180.0,K:360.0,TR:-180.0,SR:-180.0,KR:360.0";
        const MTU23_PAYLOAD: usize = 20;

        #[test]
        fn full_packet_exceeds_default_mtu_but_t_s_survive_the_cut() {
            assert!(FULL.len() > MTU23_PAYLOAD);
            assert!("T:-180.0,S:-180.0,".len() <= MTU23_PAYLOAD);
        }

        #[test]
        fn cut_after_k_keeps_pitch_flags_truncated_roll_not_silently_zero() {
            let cut = &FULL[..MTU23_PAYLOAD];
            assert_eq!(cut, "T:-180.0,S:-180.0,K:");
            let p = parse_angle_packet(cut);
            let (raw, has_roll, truncated) = angles(&p);
            assert_eq!(raw.thigh, -180.0);
            assert_eq!(raw.shin, -180.0);
            assert!(truncated);
            assert!(!has_roll);
        }

        #[test]
        fn cut_mid_prefix_still_degrades_not_discards() {
            let p = parse_angle_packet("T:-180.0,S:-180.0,K");
            let (raw, _, truncated) = angles(&p);
            assert_eq!(raw.thigh, -180.0);
            assert!(truncated);
        }

        #[test]
        fn half_a_roll_pair_is_dropped_not_used_for_varus_valgus() {
            let p = parse_angle_packet("T:1.0,S:2.0,K:1.0,TR:3.0");
            let (raw, has_roll, truncated) = angles(&p);
            assert_eq!(raw.thigh_roll, 0.0);
            assert!(!has_roll);
            assert!(truncated);
        }

        #[test]
        fn missing_t_or_s_is_malformed_not_degraded() {
            assert!(matches!(
                parse_angle_packet("S:2.0,K:1.0,TR:3.0,SR:4.0"),
                ParsedPacket::Malformed { .. }
            ));
            assert!(matches!(
                parse_angle_packet("T:1.0,K:1.0,TR:3.0,SR:4.0"),
                ParsedPacket::Malformed { .. }
            ));
        }

        #[test]
        fn mid_packet_garbage_is_malformed_not_truncation() {
            assert!(matches!(
                parse_angle_packet("T:1.0,S:abc,K:1.0,TR:3.0,SR:4.0"),
                ParsedPacket::Malformed { .. }
            ));
            assert!(matches!(
                parse_angle_packet("T:1.0,T:2.0,S:3.0"),
                ParsedPacket::Malformed { .. }
            ));
        }
    }

    mod has_roll_vs_truncated {
        use super::*;

        #[test]
        fn six_axis_has_roll_not_truncated() {
            let p = parse_angle_packet("T:12.5,S:-45.2,K:57.7,TR:1.2,SR:-0.8,KR:2.0");
            let (_, has_roll, truncated) = angles(&p);
            assert!(has_roll);
            assert!(!truncated);
        }

        #[test]
        fn true_legacy_three_field_not_truncated() {
            let p = parse_angle_packet("T:10.0,S:20.0,K:10.0");
            let (_, has_roll, truncated) = angles(&p);
            assert!(!has_roll);
            assert!(!truncated);
        }

        #[test]
        fn cut_exactly_on_a_value_boundary_under_reports_rather_than_over_reports() {
            let p = parse_angle_packet("T:12.5,S:-45.2,K:57.");
            let (raw, has_roll, truncated) = angles(&p);
            assert_eq!(raw.thigh, 12.5);
            assert!(!has_roll);
            assert!(!truncated);
        }

        #[test]
        fn bare_number_legacy_not_truncated() {
            let p = parse_angle_packet("45.5");
            let (_, has_roll, truncated) = angles(&p);
            assert!(!has_roll);
            assert!(!truncated);
        }
    }
}
