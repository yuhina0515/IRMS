# 生物力學與關節座標

感測器角度、肢段姿態與解剖關節角如何區分？

本主題 9 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src/services/angleMath.ts](../../../IRMS_App_Tauri/src/services/angleMath.ts)
- [IRMS_App_Tauri/src/store/useStore.ts](../../../IRMS_App_Tauri/src/store/useStore.ts)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **PMID-10828334** [Measurement of the screw-home motion of the knee is sensitive to errors in axis alignment.](../sources/PMID-10828334.md) (2000；abstract) — 膝軸定義誤差會造成運動學串擾，小幅內外旋與內外翻可能受對齊影響。
- **PMID-6865355** [A joint coordinate system for the clinical description of three-dimensional motions: application to the knee.](../sources/PMID-6865355.md) (1983；abstract) — 經典膝關節座標系把三維相對運動與臨床命名連結，是定義屈伸、內外翻及旋轉的基礎。
- **PMID-32807309** [Coordinate system requirements to determine motions of the tibiofemoral joint free from kinematic crosstalk errors.](../sources/PMID-32807309.md) (2020；abstract) — 膝座標軸的幾何條件影響運動學串擾，現行建議也需按問題檢查適用性。
- **PMID-27814954** [Modification of the Grood and Suntay Joint Coordinate System equations for knee joint flexion.](../sources/PMID-27814954.md) (2017；abstract) — 傳統 Grood–Suntay 方程在大屈曲範圍可能有局限，角度演算法需測試完整使用區間。
- **PMID-18280623** [The effect of gait modification on the external knee adduction moment is reference frame dependent.](../sources/PMID-18280623.md) (2008；abstract) — 膝內收力矩對步態修改的效果依參考座標系改變，指標定義必須隨結果報告。
- **PMID-15844264** [ISB recommendation on definitions of joint coordinate systems of various joints for the reporting of human joint motion--Part II: shoulder, elbow, wrist and hand.](../sources/PMID-15844264.md) (2005；abstract) — ISB 上肢座標系建議有助統一局部軸與關節描述，用於日後上肢模組時應依關節套用。
- **PMID-15311818** [Establishment of a knee-joint coordinate system from helical axes analysis--a kinematic approach without anatomical referencing.](../sources/PMID-15311818.md) (2004；abstract) — 由螺旋軸建立功能座標系提供不依解剖參照的途徑，但可再現的參考運動仍是前提。
- **PMID-11934426** [ISB recommendation on definitions of joint coordinate system of various joints for the reporting of human joint motion--part I: ankle, hip, and spine. International Society of Biomechanics.](../sources/PMID-11934426.md) (2002；abstract) — ISB 第一部分涵蓋踝、髖與脊柱，適合這些關節的命名；不能誤稱為專門膝關節標準。
- **PMID-1583014** [Three-dimensional kinematics of the human knee during walking.](../sources/PMID-1583014.md) (1992；abstract) — 人體膝在步行存在多軸角度與位移，單一理想鉸鏈模型只描述部分運動。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
