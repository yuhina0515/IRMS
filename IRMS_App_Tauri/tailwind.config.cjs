/** @type {import('tailwindcss').Config} */
// 2026-09-24 UI 重建(設計語言 v2):樣式改由 src/styles/*.css 以 CSS 變數撰寫,
// Tailwind 只提供 preflight 重設(src/styles/reset.css 的 @tailwind base),不再產生 utility。
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: []
}
