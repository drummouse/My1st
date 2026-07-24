export default function StudioPanel({ as: Component = 'section', className = '', ...props }) {
  return <Component className={`studio-panel ${className}`.trim()} {...props} />;
}
