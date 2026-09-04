/** 拾序品牌标识：与桌面应用图标使用同一套「工作流文件页」图形。 */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <img
      src="./shixu-logo.png"
      width={size}
      height={size}
      alt="拾序"
      draggable={false}
      style={{ display: 'block', flexShrink: 0, objectFit: 'contain' }}
    />
  )
}
