/**
 * Projects header art in the landing page's voice: cream paper, dot grid, and
 * the branch. Plan status lives in the title bar, so this stays words-light.
 * The branch is lazy-loaded with fixed dimensions and absolute placement, so
 * it never moves the layout.
 */
export function UpgradeBanner() {
  return (
    <div className="landing-banner">
      <div className="landing-banner-dots" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative landing art */}
      <img
        className="landing-banner-branch"
        src="/art/branch-r-480.webp"
        srcSet="/art/branch-r-480.webp 480w, /art/branch-r.webp 864w"
        sizes="300px"
        alt=""
        width={480}
        height={640}
        loading="lazy"
        decoding="async"
        aria-hidden
      />
      <div className="landing-banner-copy">
        <p className="landing-banner-title">Your code ships itself</p>
        <p className="landing-banner-sub">Push to GitHub or drop in a zip. Runex builds it into a live HTTPS URL.</p>
      </div>
    </div>
  );
}
