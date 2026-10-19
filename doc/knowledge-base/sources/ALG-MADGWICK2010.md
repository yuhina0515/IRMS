---
tags: [irms, knowledge, reference]
source_id: ALG-MADGWICK2010
date: 2026-10-03
---

# An efficient orientation filter for inertial and inertial/magnetic sensor arrays

[姿態融合與濾波](../topics/fusion.md)

## 書目與原始來源

Madgwick SOH. 2010. An efficient orientation filter for inertial and inertial/magnetic sensor arrays. Author technical report. https://x-io.co.uk/downloads/madgwick_internal_report.pdf.

- 原始入口：[來源](https://x-io.co.uk/downloads/madgwick_internal_report.pdf)
- 類型：`technical-report`；研究形式：`algorithm-method`
- 閱讀深度：`full-text-sections`；查核：`retrieved`
- 證據定位：Author report Abstract; sections 4.1, 4.4 and 7 in retrieved PDF excerpts

## 重點

作者技術報告提出四元數梯度下降姿態濾波，分別討論六軸與含磁力計輸入的實作。

## IRMS 用途

作為韌體姿態融合比較候選，以相同原始六軸訊號檢查精度、延遲、運算與初始化；演算法變更需獨立驗證。

## 適用限制

姿態估計誤差不等於膝關節角誤差；技術報告與期刊文章的證據形式不同，離線成績不可當即時性能。

研究族群、樣本數、效應量、完整實驗設定與偏誤風險未全面擷取；正式報告採用數值前須核對原文。

## 追溯與版權

資料取得／檢查日：2026-10-03。來源記錄：[出處](https://x-io.co.uk/downloads/madgwick_internal_report.pdf)。

Original summary and citation only; no full report or publisher text redistributed.

[知識庫首頁](../README.md) · [完整機器可讀資料](../data/catalog.json)
