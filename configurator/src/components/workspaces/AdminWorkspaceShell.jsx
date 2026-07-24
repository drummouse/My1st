import MobileWorkspaceHeader from './MobileWorkspaceHeader.jsx';

export default function AdminWorkspaceShell({
  title,
  onClose,
  children,
  topBar,
  onOpenNavigation,
}) {
  return (
    <section className="admin-workspace-shell" aria-labelledby="admin-workspace-title">
      <div className="admin-workspace-top sales-workspace-top" id="admin-navigation-drawer" popover="auto">
        {topBar}
      </div>
      <div className="admin-workspace-mobile-header">
        <MobileWorkspaceHeader
          eyebrow="Administration"
          menuTarget="admin-navigation-drawer"
          mode="admin"
          onMenu={onOpenNavigation}
          step={{ label: title, description: 'Application settings and catalogs' }}
        />
      </div>
      <header className="admin-workspace-header">
        <div>
          <span>Administration</span>
          <h1 id="admin-workspace-title">{title}</h1>
        </div>
        <button aria-label={`Close ${title}`} onClick={onClose} type="button">
          Close
        </button>
      </header>
      <main className="admin-workspace-content">{children}</main>
    </section>
  );
}
