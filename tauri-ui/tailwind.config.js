/** @type {import('tailwindcss').Config} */
// Minimalist Monochrome：纯黑白 + 系统衬线，零圆角，零阴影
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // 衬线（display + body）：系统自带，中文走宋体
        serif: [
          "Georgia",
          '"Times New Roman"',
          '"Source Han Serif SC"',
          '"Songti SC"',
          '"宋体"',
          "serif",
        ],
        // 等宽（labels / 数据 / 日志）
        mono: [
          "Consolas",
          "Menlo",
          '"Courier New"',
          '"Noto Sans Mono CJK SC"',
          "monospace",
        ],
      },
      colors: {
        // 单色变量（在 index.css 里定义为 CSS var）
        ink: "var(--ink)",
        paper: "var(--paper)",
        muted: "var(--muted)",
        "muted-fg": "var(--muted-fg)",
        "border-light": "var(--border-light)",
      },
      letterSpacing: {
        // 配合 uppercase 小标签使用
        widest: "0.18em",
      },
    },
  },
  plugins: [],
};
