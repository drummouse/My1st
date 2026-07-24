export default function StudioButton({ variant = 'secondary', className = '', type = 'button', ...props }) {
  return <button type={type} className={`studio-button studio-button-${variant} ${className}`.trim()} {...props} />;
}
