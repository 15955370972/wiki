import { Empty, Typography } from 'antd'

const { Title, Paragraph } = Typography

/** 阶段占位页：各模块在后续阶段逐一实现 */
export default function Placeholder({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ paddingBlock: 80, textAlign: 'center' }}>
      <Title level={2}>{title}</Title>
      <Paragraph type="secondary">{hint}</Paragraph>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="内容建设中" />
    </div>
  )
}
