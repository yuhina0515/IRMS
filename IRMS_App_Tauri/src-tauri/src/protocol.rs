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
pub struct AccelVector {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawAngles {
    pub thigh: f64,
    pub shin: f64,
    pub thigh_roll: f64,
    pub shin_roll: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thigh_accel: Option<AccelVector>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shin_accel: Option<AccelVector>,
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
                    thigh_accel: None,
                    shin_accel: None,
                },
                has_roll: false,
                truncated: false,
            },
            _ => malformed(trimmed),
        };
    }

    let mut field: HashMap<&str, f64> = HashMap::new();
    let mut truncated = false;
    let mut accel_values: Option<[f64; 6]> = None;
    let last_idx = parts.len() - 1;

    for (i, part) in parts.iter().enumerate() {
        if i == last_idx && part.starts_with("V:") {
            // 不可 filter_map 丟掉壞欄位，否則七欄含一個壞值會被誤收為有效六欄。
            let values: Option<Vec<f64>> = part[2..]
                .split('/')
                .map(|value| value.trim().parse::<f64>().ok().filter(|n| n.is_finite()))
                .collect();
            if let Some(values) = values.and_then(|values| values.try_into().ok()) {
                accel_values = Some(values);
            } else {
                truncated = true;
            }
            continue;
        }
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
            thigh_roll: if has_roll {
                thigh_roll_raw.unwrap()
            } else {
                0.0
            },
            shin_roll: if has_roll {
                shin_roll_raw.unwrap()
            } else {
                0.0
            },
            thigh_accel: accel_values.map(|values| AccelVector {
                x: values[0],
                y: values[1],
                z: values[2],
            }),
            shin_accel: accel_values.map(|values| AccelVector {
                x: values[3],
                y: values[4],
                z: values[5],
            }),
        },
        has_roll,
        truncated,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 共用 fixture 驗證兩端相同的欄位數、空值與截斷處理。
    #[test]
    fn shared_vector_packet_contract() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../fixtures/vector-packets.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let (raw, _, truncated) = angles(&parse_angle_packet(case["packet"].as_str().unwrap()));
            assert_eq!(
                truncated,
                case["truncated"].as_bool().unwrap(),
                "{}",
                case["name"]
            );
            assert_eq!((raw.thigh, raw.shin), (1.0, 2.0));
            let actual = match (raw.thigh_accel, raw.shin_accel) {
                (Some(t), Some(s)) => Some(vec![t.x, t.y, t.z, s.x, s.y, s.z]),
                (None, None) => None,
                _ => panic!("Partial vector pair"),
            };
            let expected: Option<Vec<f64>> =
                serde_json::from_value(case["vectors"].clone()).unwrap();
            assert_eq!(actual, expected, "{}", case["name"]);
        }
    }

    // 共用 fixture 驗證一般封包解析:合法欄位組合、ERR、malformed、MTU 截斷降級。
    // 與上面的向量 fixture 分開——那份固定 T:1,S:2 只變化 V: 欄位,這份的每個案例
    // T:/S: 之外的欄位組合都不同。src/shared/protocol.contract.test.ts 讀同一份 JSON。
    #[test]
    fn angle_packet_contract() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../fixtures/angle-packets.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let packet = case["packet"].as_str().unwrap();
            let kind = case["kind"].as_str().unwrap();
            let parsed = parse_angle_packet(packet);

            match kind {
                "error" => {
                    let ParsedPacket::Error { code } = &parsed else {
                        panic!("{name}: expected Error, got {parsed:?}")
                    };
                    assert_eq!(code, case["code"].as_str().unwrap(), "{name}");
                }
                "malformed" => {
                    assert!(
                        matches!(parsed, ParsedPacket::Malformed { .. }),
                        "{name}: expected Malformed, got {parsed:?}"
                    );
                }
                "angles" => {
                    let (raw, has_roll, truncated) = angles(&parsed);
                    assert_eq!(has_roll, case["hasRoll"].as_bool().unwrap(), "{name}");
                    assert_eq!(truncated, case["truncated"].as_bool().unwrap(), "{name}");
                    let expected_raw = &case["raw"];
                    assert_eq!(raw.thigh, expected_raw["thigh"].as_f64().unwrap(), "{name}");
                    assert_eq!(raw.shin, expected_raw["shin"].as_f64().unwrap(), "{name}");
                    assert_eq!(
                        raw.thigh_roll,
                        expected_raw["thighRoll"].as_f64().unwrap(),
                        "{name}"
                    );
                    assert_eq!(
                        raw.shin_roll,
                        expected_raw["shinRoll"].as_f64().unwrap(),
                        "{name}"
                    );
                    let expected_vec3 = |v: &serde_json::Value| -> Option<[f64; 3]> {
                        if v.is_null() {
                            return None;
                        }
                        Some([
                            v["x"].as_f64().unwrap(),
                            v["y"].as_f64().unwrap(),
                            v["z"].as_f64().unwrap(),
                        ])
                    };
                    assert_eq!(
                        raw.thigh_accel.map(|v| [v.x, v.y, v.z]),
                        expected_vec3(&expected_raw["thighAccel"]),
                        "{name}"
                    );
                    assert_eq!(
                        raw.shin_accel.map(|v| [v.x, v.y, v.z]),
                        expected_vec3(&expected_raw["shinAccel"]),
                        "{name}"
                    );
                }
                other => panic!("{name}: unknown fixture kind {other}"),
            }
        }
    }

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

    // MTU23 切點本身的長度前提(不涉及解析輸出)——獨立驗證,不與共用 fixture 重複。
    // 解析輸出的斷言已併入上面的 angle_packet_contract。
    #[test]
    fn full_packet_exceeds_default_mtu_but_t_s_survive_the_cut() {
        const FULL: &str = "T:-180.0,S:-180.0,K:360.0,TR:-180.0,SR:-180.0,KR:360.0";
        const MTU23_PAYLOAD: usize = 20;
        assert!(FULL.len() > MTU23_PAYLOAD);
        assert!("T:-180.0,S:-180.0,".len() <= MTU23_PAYLOAD);
        assert_eq!(&FULL[..MTU23_PAYLOAD], "T:-180.0,S:-180.0,K:");
    }
}
