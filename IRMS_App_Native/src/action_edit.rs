//! 處方輸入只解析完整有限數字，沿用共用判定界限，保留未顯示的舊欄位。
use irms_core::judge::{AngleLimits, TriggerConfig, TriggerType};
use irms_core::types::{CustomAction, CustomActionInput};

#[derive(Clone, Default)]
pub struct Draft {
    pub name: String,
    pub description: String,
    pub target: String,
    pub tolerance: String,
    pub hold_seconds: String,
    pub trigger: i32,
}
impl Draft {
    pub fn from_action(action: &CustomAction) -> Self {
        Self {
            name: action.name.clone(),
            description: action.description.clone().unwrap_or_default(),
            target: action.target_angle.to_string(),
            tolerance: action.tolerance.to_string(),
            hold_seconds: (action.hold_time_ms as f64 / 1000.0).to_string(),
            trigger: match action.trigger_type.as_str() {
                "segment_elevation" => 1,
                "segment_extension" => 2,
                "joint_angle" => 0,
                _ => -1,
            },
        }
    }
    pub fn new_action() -> Self {
        Self {
            target: "90".into(),
            tolerance: "10".into(),
            hold_seconds: "3".into(),
            ..Self::default()
        }
    }
    pub fn validated(&self, previous: Option<&CustomAction>) -> Result<CustomActionInput, String> {
        let name = self.name.trim();
        if name.is_empty() {
            return Err("請輸入動作名稱".into());
        }
        let number = |text: &str, label: &str| -> Result<f64, String> {
            text.trim()
                .parse::<f64>()
                .ok()
                .filter(|v| v.is_finite())
                .ok_or_else(|| format!("{label}請輸入完整有效數字"))
        };
        let (trigger_type, trigger) = match self.trigger {
            0 => ("joint_angle", TriggerType::JointAngle),
            1 => ("segment_elevation", TriggerType::SegmentElevation),
            2 => ("segment_extension", TriggerType::SegmentExtension),
            _ => return Err("請選擇有效的判定方式".into()),
        };
        let hold_seconds = number(&self.hold_seconds, "保持秒數")?;
        let hold_ms = hold_seconds * 1000.0;
        if !hold_ms.is_finite() {
            return Err("保持秒數超出有效範圍".into());
        }
        let config = TriggerConfig {
            target_angle: number(&self.target, "目標角度")?,
            tolerance: number(&self.tolerance, "容錯角度")?,
            hold_time_ms: hold_ms,
            trigger_type: trigger,
            limits: AngleLimits::default(),
        }
        .normalized();
        Ok(CustomActionInput {
            name: name.into(),
            description: if self.description.trim().is_empty() {
                None
            } else {
                Some(self.description.trim().into())
            },
            protocol: previous.map_or_else(|| "knee".into(), |a| a.protocol.clone()),
            target_angle: config.target_angle,
            tolerance: config.tolerance,
            hold_time_ms: config.hold_time_ms as i64,
            trigger_type: trigger_type.into(),
            safety_limit: previous.and_then(|a| a.safety_limit),
        })
    }
}

/// 以 ID 還原選用；缺失時回到第一個支援的關節動作，而非沿用過期列號。
pub fn selected_index(actions: &[CustomAction], id: Option<&str>) -> Option<usize> {
    id.and_then(|id| id.parse::<i64>().ok())
        .and_then(|id| actions.iter().position(|a| a.id == id))
        .or_else(|| actions.iter().position(|a| a.trigger_type == "joint_angle"))
        .or_else(|| (!actions.is_empty()).then_some(0))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_numeric_text_clamps_and_preserves_legacy_fields() {
        let old = CustomAction {
            id: i64::MAX,
            name: "old".into(),
            description: Some("note".into()),
            protocol: "knee".into(),
            target_angle: 70.5,
            tolerance: 3.5,
            hold_time_ms: 1234,
            trigger_type: "segment_extension".into(),
            safety_limit: Some(140.0),
        };
        let unchanged = Draft::from_action(&old).validated(Some(&old)).unwrap();
        assert_eq!(
            (
                unchanged.target_angle,
                unchanged.tolerance,
                unchanged.hold_time_ms,
                unchanged.safety_limit
            ),
            (70.5, 3.5, 1234, Some(140.0))
        );
        let draft = Draft {
            name: " New ".into(),
            target: "999".into(),
            tolerance: "-5".into(),
            hold_seconds: "0".into(),
            ..Draft::new_action()
        };
        let clamped = draft.validated(None).unwrap();
        assert_eq!(
            (
                clamped.target_angle,
                clamped.tolerance,
                clamped.hold_time_ms
            ),
            (170.0, 1.0, 500)
        );
        assert_eq!(clamped.name, "New");
        for bad in ["", "NaN", "inf", "90oops"] {
            assert!(Draft {
                target: bad.into(),
                ..draft.clone()
            }
            .validated(None)
            .is_err());
        }
        assert!(Draft {
            trigger: 99,
            ..draft
        }
        .validated(None)
        .is_err());
    }
    #[test]
    fn selection_survives_reordering_and_missing_ids_fall_back() {
        let a = |id, kind: &str| CustomAction {
            id,
            name: id.to_string(),
            description: None,
            protocol: "knee".into(),
            target_angle: 45.0,
            tolerance: 10.0,
            hold_time_ms: 2000,
            trigger_type: kind.into(),
            safety_limit: None,
        };
        let list = vec![a(2, "segment_extension"), a(i64::MAX, "joint_angle")];
        assert_eq!(selected_index(&list, Some(&i64::MAX.to_string())), Some(1));
        assert_eq!(selected_index(&list, Some("1")), Some(1));
        assert_eq!(selected_index(&[], None), None);
    }
}
