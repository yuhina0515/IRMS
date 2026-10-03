# 簽章、權限與資安工程

更新、模組與遙測各自跨越哪些信任邊界？

本主題 8 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src-tauri/src/modules.rs](../../../IRMS_App_Tauri/src-tauri/src/modules.rs)
- [IRMS_App_Tauri/src-tauri/src/firmware_update.rs](../../../IRMS_App_Tauri/src-tauri/src/firmware_update.rs)
- [IRMS_App_Tauri/src-tauri/src/telemetry.rs](../../../IRMS_App_Tauri/src-tauri/src/telemetry.rs)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **DOC-ESP-SECUREBOOT** [Secure Boot v2](../sources/DOC-ESP-SECUREBOOT.md) (持續文件；primary-page-excerpt) — 裝置安全開機驗證與 App 端下載簽章是不同信任邊界，不能互相替代。
- **DOC-NIST-BASELINE** [NISTIR 8259A: IoT Device Cybersecurity Capability Core Baseline](../sources/DOC-NIST-BASELINE.md) (持續文件；primary-page-excerpt) — 核心能力涵蓋裝置識別、組態、資料與更新保護，適合建立工程檢查項。
- **DOC-NIST-IOT** [NIST SP 800-213: IoT Device Cybersecurity Guidance for the Federal Government](../sources/DOC-NIST-IOT.md) (持續文件；primary-page-excerpt) — IoT 採用與能力需求用於規劃裝置資料、更新與風險管理，原適用語境為美國聯邦機關。
- **DOC-NIST-SSDF** [NIST SP 800-218: Secure Software Development Framework v1.1](../sources/DOC-NIST-SSDF.md) (持續文件；primary-page-excerpt) — 安全開發框架提供版本、依賴、發佈與漏洞處理的程序參考，並非 IRMS 認證證明。
- **DOC-RFC8032** [RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)](../sources/DOC-RFC8032.md) (持續文件；primary-page-excerpt) — Ed25519 的標準演算法與測試向量用於理解簽章；具體容器及預雜湊方案需另確認。
- **DOC-TAURI-CAPABILITIES** [Capabilities](../sources/DOC-TAURI-CAPABILITIES.md) (持續文件；primary-page-excerpt) — Capabilities 約束允許的原生操作，模組可信與原生權限限制必須分別處理。
- **DOC-TAURI-SECURITY** [Security](../sources/DOC-TAURI-SECURITY.md) (持續文件；primary-page-excerpt) — 安全模型說明 webview 與原生權限的邊界，應按資料流與信任來源評估風險。
- **DOC-TAURI-UPDATER** [Updater](../sources/DOC-TAURI-UPDATER.md) (持續文件；primary-page-excerpt) — 更新器簽章與公開金鑰是發佈驗證依據，傳輸完成不等同可信映像已驗證。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
