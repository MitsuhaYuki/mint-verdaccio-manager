import { StyleProvider } from '@ant-design/cssinjs'
import { App, ConfigProvider, type ThemeConfig, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { type FC, useMemo } from 'react'
import { useColorScheme } from './lib/useColorScheme'
import { Entrance } from './pages'

const Content: FC = () => {
  const scheme = useColorScheme()
  const themeConfig = useMemo<ThemeConfig>(
    () => ({
      algorithm: scheme === 'light' ? theme.defaultAlgorithm : theme.darkAlgorithm,
      components: {
        Table: {
          cellFontSizeSM: 12,
          rowHoverBg: 'unset'
        }
      }
    }),
    [scheme]
  )

  return (
    <StyleProvider layer>
      <ConfigProvider theme={themeConfig} wave={{ disabled: true }} locale={zhCN}>
        <App message={{ maxCount: 1 }} notification={{ stack: { threshold: 1 } }} className='h-full w-full overflow-auto'>
          <div className='scheme-dark relative h-full w-full bg-neutral-50 dark:bg-neutral-950'>
            <Entrance />
          </div>
        </App>
      </ConfigProvider>
    </StyleProvider>
  )
}

Content.displayName = 'App'
export { Content as App }
