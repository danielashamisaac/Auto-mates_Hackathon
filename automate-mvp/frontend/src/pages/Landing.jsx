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
        <div className="flex-center" style={{ marginBottom: 18 }}>
          <Sparkles size={18} color="#a05cff" />
          <span className="tagline" style={{ color: '#a05cff' }}>HUB SOLUTION · 2026</span>
        </div>
        <h1>AUTOMATE</h1>
        <p className="tagline">Automate · Innovate · Elevate</p>
        <p className="blurb">
          A unified portal for student registration, eligibility assessment, and payment management.
          Choose a track, prove your aptitude, and walk away with a clean digital receipt and
          your class timetable — all in one place.
        </p>

        <div className="hero-grid">
          {actions.map((a) => (
            <Link key={a.to} to={a.to} className="action-card">
              <div className="icon">
                <a.Icon size={22} />
              </div>
              <h2>{a.title}</h2>
              <p>{a.description}</p>
              <div style={{ marginTop: 'auto', color: '#4f8cff', fontWeight: 600, fontSize: 13, letterSpacing: '0.16em' }}>
                ENTER →
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
