import { Layout, Menu, Button, theme } from 'antd'
import { MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useThemeMode } from '@/theme/ThemeProvider'

const { Header, Content, Footer } = Layout

const NAV_ITEMS = [
  { key: '/', label: '首页' },
  { key: '/notes', label: '笔记' },
  { key: '/projects', label: '项目' },
  { key: '/snippets', label: '代码片段' },
  { key: '/about', label: '关于' },
]

function currentNavKey(pathname: string): string {
  // /notes/abc 也归属 /notes 高亮
  const match = NAV_ITEMS.find(
    (item) => item.key !== '/' && pathname.startsWith(item.key),
  )
  return match?.key ?? '/'
}

export default function BasicLayout() {
  const { mode, toggle } = useThemeMode()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const {
    token: { colorBgContainer },
  } = theme.useToken()

  return (
    <Layout style={{ minHeight: '100%' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: colorBgContainer,
          borderBottom: '1px solid rgba(128,128,128,0.15)',
          paddingInline: 24,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <div
            onClick={() => navigate('/')}
            className="meta-mono"
            style={{
              fontSize: 18,
              fontWeight: 700,
              cursor: 'pointer',
              color: 'inherit',
              paddingInlineEnd: 32,
              whiteSpace: 'nowrap',
            }}
          >
            wiki
          </div>
          <Menu
            mode="horizontal"
            selectedKeys={[currentNavKey(pathname)]}
            items={NAV_ITEMS}
            onClick={({ key }) => navigate(key)}
            style={{ flex: 1, minWidth: 0, borderBottom: 'none', background: 'transparent' }}
          />
        </div>
        <Button
          type="text"
          aria-label="切换主题"
          icon={mode === 'light' ? <MoonOutlined /> : <SunOutlined />}
          onClick={toggle}
        />
      </Header>

      <Content style={{ padding: '32px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Outlet />
        </div>
      </Content>

      <Footer style={{ textAlign: 'center', fontSize: 13, opacity: 0.65 }}>
        wiki · 用 React 与 Ant Design 搭建的个人笔记库
      </Footer>
    </Layout>
  )
}
