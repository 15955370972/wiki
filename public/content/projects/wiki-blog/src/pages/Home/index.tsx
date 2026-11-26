import { Typography, Button, Space } from 'antd'
import { ReadOutlined, CodeOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const { Title, Paragraph } = Typography

/** 首页：骨架版，阶段四会加入最新笔记 / 精选项目与统计 */
export default function Home() {
  const navigate = useNavigate()

  return (
    <div style={{ paddingBlock: 96, textAlign: 'center' }}>
      <Title level={1} style={{ marginBottom: 8 }}>
        我的笔记库
      </Title>
      <Paragraph type="secondary" style={{ fontSize: 16, maxWidth: 560, marginInline: 'auto' }}>
        记录学习过程的笔记、做过的前端项目，以及值得留存的代码片段
      </Paragraph>
      <Space size="middle" style={{ marginTop: 32 }} wrap>
        <Button type="primary" size="large" icon={<ReadOutlined />} onClick={() => navigate('/notes')}>
          阅读笔记
        </Button>
        <Button size="large" icon={<AppstoreOutlined />} onClick={() => navigate('/projects')}>
          看看项目
        </Button>
        <Button size="large" icon={<CodeOutlined />} onClick={() => navigate('/snippets')}>
          代码片段
        </Button>
      </Space>
    </div>
  )
}
