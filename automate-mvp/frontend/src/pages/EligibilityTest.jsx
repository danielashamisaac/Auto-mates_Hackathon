import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import StepIndicator from '../components/StepIndicator.jsx';
import { api } from '../api.js';
import { getState, patchState, newCandidateId } from '../store.js';
import { useToast } from '../components/Toast.jsx';

const STEPS = ['Category', 'Department', 'Eligibility', 'Bio-data', 'Payment'];

const LETTERS = ['A', 'B', 'C', 'D'];

export default function EligibilityTest() {
  const state = getState();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [qIndex, setQIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!state.department || !state.category) {
      navigate('/capture');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api.startEligibility(state.candidateId, state.department.slug);
        if (cancelled) return;
        setQuestions(data.questions);
        setAnswers({});
        setQIndex(0);
        setResult(null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not start eligibility test');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, state.candidateId, state.department, state.category]);

  const total = questions.length;
  const current = questions[qIndex];
  const allAnswered = useMemo(() => questions.every((_, i) => Number.isFinite(answers[i])), [answers, questions]);

  async function submit() {
    if (!allAnswered) {
      toast.push({ kind: 'error', title: 'Answer all questions', message: 'Please answer every question before submitting.' });
      return;
    }
    setSubmitting(true);
    try {
      const ordered = questions.map((_, i) => answers[i]);
      const res = await api.submitEligibility(state.candidateId, state.department.slug, ordered);
      setResult(res);
      if (res.passed) {
        toast.push({ kind: 'success', title: 'You passed!', message: `Score ${res.score}% — proceeding to registration.` });
        patchState({ step: 3, latestScore: res.score });
        setTimeout(() => navigate('/capture/form'), 900);
      } else if (res.locked) {
        toast.push({ kind: 'error', title: 'Attempts exhausted', message: 'Please pick another department.' });
      } else {
        toast.push({ kind: 'info', title: `Score ${res.score}%`, message: `Attempts left: ${res.attemptsRemaining}` });
      }
    } catch (err) {
      toast.push({ kind: 'error', title: 'Submission failed', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  function resetAttempts() {
    patchState({ candidateId: newCandidateId() });
    toast.push({ kind: 'info', title: 'Attempts reset', message: 'Demo mode — fresh candidate ID generated.' });
    navigate('/capture/eligibility');
  }

  if (!state.department) return null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Step 3 · Eligibility Test — {state.department.name}</h1>
          <p>10 multiple-choice questions · Pass mark 60% · 3 attempts maximum</p>
        </div>
        <div className="flex gap-12">
          <button className="btn btn-ghost" onClick={resetAttempts} title="Generate a fresh candidate ID for live demos">
            <RotateCcw size={14} /> Reset Attempts
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/capture/department')}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      </div>

      <StepIndicator steps={STEPS} activeIndex={2} />

      {error && (
        <div className="warning-banner">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {result && (
        <div className={`score-banner ${result.passed ? 'pass' : result.locked ? 'locked' : 'fail'}`}>
          {result.passed
            ? `Passed with ${result.score}% — moving to registration.`
            : result.locked
              ? `Locked out at ${result.score}% after ${result.attemptsUsed} attempts. Please pick another department.`
              : `Score ${result.score}% — attempts remaining: ${result.attemptsRemaining}.`}
        </div>
      )}

      {loading ? (
        <div className="flex-center text-dim"><div className="spinner" /> Loading questions…</div>
      ) : !result?.passed && (
        <div className="quiz-card">
          {result && !result.passed && !result.locked && (
            <div className="flex" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
              <button className="btn btn-ghost" onClick={() => {
                setResult(null);
                setAnswers({});
                setQIndex(0);
              }}>
                <RotateCcw size={14} /> Try again
              </button>
            </div>
          )}
          {current && (
            <>
              <div className="quiz-progress">
                <span>Question {qIndex + 1} of {total}</span>
                <span>{Object.keys(answers).filter((k) => Number.isFinite(answers[k])).length} answered</span>
              </div>
              <p className="quiz-q">{current.q}</p>
              <div className="quiz-options">
                {current.options.map((opt, i) => {
                  const selected = answers[qIndex] === i;
                  return (
                    <div
                      key={i}
                      className={`quiz-option ${selected ? 'selected' : ''}`}
                      onClick={() => setAnswers((prev) => ({ ...prev, [qIndex]: i }))}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="letter">{LETTERS[i]}</div>
                      <div>{opt}</div>
                    </div>
                  );
                })}
              </div>

              <div className="quiz-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => setQIndex((i) => Math.max(0, i - 1))}
                  disabled={qIndex === 0}
                >
                  ← Previous
                </button>
                {qIndex < total - 1 ? (
                  <button className="btn btn-primary" onClick={() => setQIndex((i) => Math.min(total - 1, i + 1))}>
                    Next →
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={submit} disabled={submitting}>
                    {submitting ? <div className="spinner" /> : 'Submit test'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
