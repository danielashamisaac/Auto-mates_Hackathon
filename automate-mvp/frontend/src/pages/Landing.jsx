import { Link } from 'react-router-dom';
import { UserPlus, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';

const actions = [
  {
    to: '/capture',
    title: 'Student Capturing',
    description: 'Register, take the eligibility test, and pick the program that fits your ambition.',
    Icon: UserPlus,
  },
  {
    to: '/payment',
    title: 'Payment Portal',
    description: 'Already registered? Resume your payment or look up an existing registration.',
    Icon: CreditCard,
  },
  {
    to: '/admin',
    title: 'Admin Portal',
    description: 'Real-time analytics, candidate management, and CSV export for the organizing team.',
    Icon: ShieldCheck,
  },
];

export default function Landing() {
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-badges">
          <div className="hero-badge">
            <Sparkles size={16} />
            <span>Hub solution · 2026</span>
          </div>
          <div className="hero-badge muted">Admissions workflow</div>
        </div>

        <h1>AUTOMATE</h1>
        <p className="tagline">Automate · Innovate · Elevate</p>
        <p className="blurb">
          A unified portal for student registration, eligibility assessment, and payment management.
          Choose a track, prove your aptitude, and walk away with a clean digital receipt and
          your class timetable — all in one place.
        </p>

        <div className="hero-stats">
          <div className="stat-box">
            <strong>3-step</strong>
            <span>Admission flow</span>
          </div>
          <div className="stat-box">
            <strong>Fast</strong>
            <span>Payment verification</span>
          </div>
          <div className="stat-box">
            <strong>Secure</strong>
            <span>Admin dashboard</span>
          </div>
        </div>

        <div className="hero-grid">
          {actions.map((a) => (
            <Link key={a.to} to={a.to} className="action-card">
              <div className="icon">
                <a.Icon size={22} />
              </div>
              <h2>{a.title}</h2>
              <p>{a.description}</p>
              <div className="action-link">ENTER →</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
