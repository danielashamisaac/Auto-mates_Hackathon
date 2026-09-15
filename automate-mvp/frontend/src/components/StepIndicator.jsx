export default function StepIndicator({ steps, activeIndex }) {
  return (
    <div className="stepper">
      {steps.map((label, idx) => {
        const status = idx === activeIndex ? 'active' : idx < activeIndex ? 'done' : '';
        return (
          <div key={label} className={`step ${status}`}>
            <div className="dot">{idx < activeIndex ? '✓' : idx + 1}</div>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
