function MiniCV() {
  return (
    <div className="cv-m">
      <div className="cv-m-head">
        <div className="cv-m-avatar" aria-hidden="true" />
        <div className="cv-m-head-lines">
          <div className="cv-m-line w-3/4" />
          <div className="cv-m-line w-1/2" />
        </div>
      </div>
      <div className="cv-m-sec">
        <div className="cv-m-label" />
        <div className="cv-m-line" />
        <div className="cv-m-line w-5/6" />
      </div>
      <div className="cv-m-chips">
        <span className="cv-m-chip" />
        <span className="cv-m-chip" />
        <span className="cv-m-chip" />
      </div>
    </div>
  );
}

export default function FlyingCVs() {
  return (
    <div className="flying-cvs" aria-hidden="true">
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <div key={n} className={`flying-cv flying-cv-${n}`}>
          <MiniCV />
        </div>
      ))}
    </div>
  );
}
