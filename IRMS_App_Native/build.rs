fn main() {
    slint_build::compile("ui/app.slint").expect("slint compile failed");
    // 將版本與圖示寫入 Windows 執行檔，供檔案內容與安裝工具識別。
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        tauri_winres::WindowsResource::new()
            .set_icon("../IRMS_App_Tauri/src-tauri/icons/icon.ico")
            .set("ProductName", "IRMS Native Beta")
            .set("FileDescription", "IRMS Native Beta")
            .set("CompanyName", "IRMS Team")
            .set("LegalCopyright", "Copyright (c) 2026 IRMS Team")
            .set("ProductVersion", env!("CARGO_PKG_VERSION"))
            .set("FileVersion", env!("CARGO_PKG_VERSION"))
            .compile()
            .expect("Windows resources failed");
    }
}
