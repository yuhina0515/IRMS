---
tags: [irms, knowledge, reference]
source_id: ALG-VQF2023
date: 2026-10-03
---

# VQF: Highly accurate IMU orientation estimation with bias estimation and magnetic disturbance rejection

[姿態融合與濾波](../topics/fusion.md)

## 書目與原始來源

Laidig D, Seel T. 2023. VQF: Highly accurate IMU orientation estimation with bias estimation and magnetic disturbance rejection. Information Fusion. 91. 187-204. https://doi.org/10.1016/j.inffus.2022.10.014.

- 原始入口：[來源](https://research.uni-hannover.de/de/publications/vqf-highly-accurate-imu-orientation-estimation-with-bias-estimati/)
- 類型：`publication`；研究形式：`algorithm-method`
- 閱讀深度：`abstract`；查核：`retrieved`
- 證據定位：Institutional publication abstract and Crossref DOI metadata

## 重點

四元數姿態融合包含偏移估計、磁干擾排除與離線版本，作者使用多個資料集比較演算法。

## IRMS 用途

作為韌體姿態融合比較候選，以相同原始六軸訊號檢查精度、延遲、運算與初始化；演算法變更需獨立驗證。

## 適用限制

姿態估計誤差不等於膝關節角誤差；技術報告與期刊文章的證據形式不同，離線成績不可當即時性能。

研究族群、樣本數、效應量、完整實驗設定與偏誤風險未全面擷取；正式報告採用數值前須核對原文。

## 追溯與版權

資料取得／檢查日：2026-10-03。來源記錄：[出處](https://research.uni-hannover.de/de/publications/vqf-highly-accurate-imu-orientation-estimation-with-bias-estimati/)。

Original summary and citation only; no full report or publisher text redistributed.

[知識庫首頁](../README.md) · [完整機器可讀資料](../data/catalog.json)
