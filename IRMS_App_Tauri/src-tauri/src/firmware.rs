// firmware.rs — Tauri 韌體檔案邊界。
// Renderer 只透過原生 dialog 取得使用者明確選取的路徑；實際讀檔、大小限制與 MD5
// 全部留在 Rust trusted side，不開放通用 filesystem capability 給 WebView。

use serde::Serialize;
use std::path::Path;

/// ESP32 為 4 MB flash；即使未來調整 partition，韌體映像也不應大於整顆 flash。
/// 先在 IPC 邊界拒絕異常大檔，避免把任意檔案完整序列化進 WebView 記憶體。
const MAX_FIRMWARE_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirmwareBinary {
    path: String,
    size: u64,
    md5: String,
    data: Vec<u8>,
}

impl FirmwareBinary {
    /// For images that did not come from a local file (firmware_update.rs downloads). `path`
    /// is only a display label there.
    pub fn new(path: String, data: Vec<u8>, md5: String) -> Self {
        Self {
            path,
            size: data.len() as u64,
            md5,
            data,
        }
    }
}

fn read_binary(path: &Path) -> Result<FirmwareBinary, String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("無法存取選取的韌體檔案: {e}"))?;
    let is_bin = canonical
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("bin"));
    if !is_bin {
        return Err("韌體檔案必須使用 .bin 副檔名".to_string());
    }

    let metadata = canonical
        .metadata()
        .map_err(|e| format!("無法讀取韌體檔案資訊: {e}"))?;
    if !metadata.is_file() {
        return Err("選取的路徑不是檔案".to_string());
    }
    if metadata.len() == 0 {
        return Err("選取的韌體檔案是空的".to_string());
    }
    if metadata.len() > MAX_FIRMWARE_BYTES {
        return Err(format!(
            "韌體檔案超過 4 MB 上限（目前為 {} bytes）",
            metadata.len()
        ));
    }

    let data = std::fs::read(&canonical).map_err(|e| format!("讀取韌體檔案失敗: {e}"))?;
    let digest = format!("{:x}", md5::compute(&data));
    Ok(FirmwareBinary {
        path: canonical.to_string_lossy().into_owned(),
        size: data.len() as u64,
        md5: digest,
        data,
    })
}

#[tauri::command]
pub async fn firmware_read_binary(path: String) -> Result<FirmwareBinary, String> {
    // 檔案 I/O 與 MD5 不占用 Tauri async executor 的工作執行緒。
    tokio::task::spawn_blocking(move || read_binary(Path::new(&path)))
        .await
        .map_err(|e| format!("韌體讀取工作異常結束: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_path(extension: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "irms-firmware-test-{}.{}",
            uuid::Uuid::new_v4(),
            extension
        ))
    }

    // CON-01 (2026-09-17): pins the wire shape irmsApi.ts's `RustFirmwareBinary` interface
    // depends on. No generated bridge, so a field rename here only surfaces at runtime otherwise.
    #[test]
    fn firmware_binary_wire_shape_matches_irms_api_ts() {
        let firmware = FirmwareBinary {
            path: "C:\\firmware\\irms.bin".to_string(),
            size: 3,
            md5: "abc".to_string(),
            data: vec![1, 2, 3],
        };
        let json = serde_json::to_value(&firmware).unwrap();
        let obj = json.as_object().unwrap();
        let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(keys, vec!["data", "md5", "path", "size"]);
    }

    #[test]
    fn reads_bin_and_returns_stable_md5() {
        let path = temp_path("bin");
        fs::write(&path, b"IRMS firmware").unwrap();

        let firmware = read_binary(&path).unwrap();
        assert_eq!(firmware.size, 13);
        assert_eq!(firmware.data, b"IRMS firmware");
        assert_eq!(firmware.md5, "c60f1292078b32d66f5efcb54d7dc7fc");

        fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_wrong_extension_and_empty_binary() {
        let wrong_extension = temp_path("txt");
        fs::write(&wrong_extension, b"not firmware").unwrap();
        assert!(read_binary(&wrong_extension).unwrap_err().contains(".bin"));
        fs::remove_file(wrong_extension).unwrap();

        let empty = temp_path("bin");
        fs::write(&empty, []).unwrap();
        assert!(read_binary(&empty).unwrap_err().contains("空的"));
        fs::remove_file(empty).unwrap();
    }

    #[test]
    fn rejects_binary_larger_than_device_flash() {
        let path = temp_path("bin");
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_FIRMWARE_BYTES + 1).unwrap();

        assert!(read_binary(&path).unwrap_err().contains("4 MB"));
        fs::remove_file(path).unwrap();
    }
}
