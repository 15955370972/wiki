import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { theme as antdTheme, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'wiki-theme-mode'

function getInitialMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface ThemeContextValue {
  mode: ThemeMode
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  toggle: () => {},
})

export function useThemeMode() {
  return useContext(ThemeContext)
}

/** 品牌设计令牌：工程师笔记本 —— 冷调纸白 / 深岩灰，靛蓝主色，等宽元信息 */
const tokens = {
  light: {
    colorPrimary: '#3D5AF1',
    colorBgLayout: '#F7F8FA',
    colorBgContainer: '#FFFFFF',
    colorText: '#24292F',
    fontFamily:
      "-apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace",
  },
  dark: {
    colorPrimary: '#7B8CFF',
    colorBgLayout: '#0F1216',
    colorBgContainer: '#161B22',
    colorText: '#D7DCE2',
    fontFamily:
      "-apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace",
  },
} as const

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode)
    document.documentElement.dataset.theme = mode
    document.documentElement.style.colorScheme = mode
  }, [mode])

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      toggle: () => setMode((m) => (m === 'light' ? 'dark' : 'light')),
    }),
    [mode],
  )

  const t = tokens[mode]

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: t.colorPrimary,
            colorBgLayout: t.colorBgLayout,
            colorBgContainer: t.colorBgContainer,
            colorText: t.colorText,
            colorLink: t.colorPrimary,
            borderRadius: 8,
            fontFamily: t.fontFamily,
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}
