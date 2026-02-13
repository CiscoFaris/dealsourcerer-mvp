export default function Header() {
  return (
    <header className="ds-header">
      <div className="ds-header-inner">
        <div className="ds-brand">
          <div className="ds-brand-title">DealSourcerer</div>
          <div className="ds-brand-sub">Corporate Development Sourcing</div>
        </div>

        <nav className="ds-nav">
          <a className="ds-nav-link" href="/sourcing">Sourcing</a>
          <a className="ds-nav-link" href="/companies">Companies</a>
          <a className="ds-nav-link" href="/conferences">Conferences</a>
          <a className="ds-nav-link" href="/mapping">Product Mapping</a>
          <a className="ds-nav-link" href="/thesis">Opportunity Thesis</a>
        </nav>

        <div className="ds-logo" title="DealSourcerer">
          <svg width="40" height="40" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            {/* Hat */}
            <path d="M20 24l12-16 12 16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M18 26h28" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            {/* Face */}
            <path d="M28 28c1 2 3 3 4 3s3-1 4-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M27 30c0 0 1-2 2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M37 30c0 0-1-2-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            {/* Beard */}
            <path d="M26 33c2 6 10 6 12 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M28 34c1 4 7 4 8 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>

            {/* Cloak / body */}
            <path d="M22 26c-2 10-2 18 0 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M42 26c2 10 2 18 0 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M22 52c8-2 12-2 20 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>

            {/* Book */}
            <path d="M24 44c4-2 12-2 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M24 44v7c4-2 12-2 16 0v-7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M32 44v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>

            {/* Staff */}
            <path d="M48 22v30" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M46 22c2-4 6-4 6 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            {/* Spark */}
            <path d="M54 16l2 2m0-2l-2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
    </header>
  );
}
