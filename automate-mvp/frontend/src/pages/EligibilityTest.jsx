import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import StepIndicator from '../components/StepIndicator.jsx';
import { api } from '../api.js';
import { getState, patchState, newCandidateId } from '../store.js';
import { useToast } from '../components/Toast.jsx';

const STEPS = ['Category', 'Department', 'Eligibility', 'Bio-data', 'Payment'];
const LETTERS = ['A', 'B', 'C', 'D'];

export default function EligibilityTest() {
  const navigate = useNavigate();
  const toast = useToast();
  const state = getState();
  const candidateId = state.candidateId;
  const category = state.category;
  const departmentSlug = state.department?.slug;
  const departmentName = state.department?.name;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState([]);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!candidateId || !category || !departmentSlug) {
      navigate('/capture', { replace: true });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError('');
    setQuestions([]);
    setSelectedAnswers({});
    setResult(null);

    api.startEligibility(candidateId, departmentSlug, controller.signal)
      .then((data) => {
        if (!active) return;
        if (!Array.isArray(data.questions) || data.questions.length !== 10) {
          throw new Error('The eligibility service returned an invalid question set.');
        }
        setQuestions(data.questions);
      })
      .catch((err) => {
        if (!active || err.name === 'AbortError') return;
        setError(err.message || 'Could not load eligibility questions.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [navigate, candidateId, category, departmentSlug, retryCount]);

  const answeredCount = questions.reduce(
    (count, question) => count + (Number.isInteger(selectedAnswers[question.id]) ? 1 : 0),
    0,
  );
  const allAnswered = questions.length === 10 && answeredCount === questions.length;

  function selectAnswer(questionId, optionIndex) {
    setSelectedAnswers((current) => ({ ...current, [questionId]: optionIndex }));
  }

  async function submit() {
    if (!allAnswered) {
      toast.push({
        kind: 'error',
        title: 'Answer all questions',
        message: 'Please select an answer for each question before submitting.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const answers = questions.map((question) => ({
        questionId: question.id,
        answer: selectedAnswers[question.id],
      }));
      const response = await api.submitEligibility(candidateId, departmentSlug, answers);
      setResult(response);

      if (response.passed) {
        toast.push({ kind: 'success', title: 'You passed!', message: `Score ${response.score}% — proceeding to registration.` });
        patchState({ step: 3, latestScore: response.score });
        setTimeout(() => navigate('/capture/form'), 900);
      } else if (response.locked) {
        toast.push({ kind: 'error', title: 'Attempts exhausted', message: 'Please pick another department.' });
      } else {
        toast.push({ kind: 'info', title: `Score ${response.score}%`, message: `Attempts left: ${response.attemptsRemaining}` });
      }
    } catch (err) {
      toast.push({ kind: 'error', title: 'Submission failed', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  function resetAttempts() {
    patchState({ candidateId: newCandidateId() });
    toast.push({ kind: 'info', title: 'Attempts reset', message: 'Demo mode — a fresh assessment session is ready.' });
    window.location.reload();
  }

  function retry() {
    setRetryCount((count) => count + 1);
  }

  if (!departmentSlug) return null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Step 3 · Eligibility Test — {departmentName}</h1>
          <p>10 multiple-choice questions · Pass mark 60% · 3 attempts maximum</p>
        </div>
        <div className="flex gap-12">
          <button className="btn btn-ghost" onClick={resetAttempts}>
            <RotateCcw size={14} /> Reset Attempts
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/capture/department')}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      </div>

      <StepIndicator steps={STEPS} activeIndex={2} />

      {error && (
        <div className="warning-banner" role="alert">
          <AlertTriangle size={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-ghost" onClick={retry}>Retry</button>
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
      ) : questions.length === 0 && !error ? (
        <div className="glass text-center">
          <p className="text-dim">No eligibility questions are available for this department.</p>
          <button className="btn btn-primary" onClick={retry}>Try again</button>
        </div>
      ) : (
        <div className="quiz-layout">
          <aside className="quiz-sidebar glass">
            <div className="quiz-side-title">Questions</div>
            <div className="quiz-side-meta">{answeredCount} of {questions.length} answered</div>
            <div className="quiz-side-list">
              {questions.map((question, index) => {
                const answered = Number.isInteger(selectedAnswers[question.id]);
                return (
                  <a key={question.id} className={`quiz-side-btn ${answered ? 'done' : ''}`} href={`#q-${index}`}>
                    {String(index + 1).padStart(2, '0')}
                  </a>
                );
              })}
            </div>
            <button className="btn btn-primary btn-block mt-16" onClick={submit} disabled={submitting || result?.passed}>
              {submitting ? <div className="spinner" /> : result?.passed ? 'Submitted ✓' : 'Submit test'}
            </button>
            <div className="text-dim mt-12" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Your answers are saved as you click. Use the numbers above to jump between questions.
            </div>
          </aside>

          <div className="quiz-main">
            {result && !result.passed && !result.locked && (
              <div className="flex" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
                <button className="btn btn-ghost" onClick={() => { setResult(null); setSelectedAnswers({}); }}>
                  <RotateCcw size={14} /> Clear my answers
                </button>
              </div>
            )}
            <div className="quiz-stack">
              {questions.map((question, index) => (
                <div key={question.id} id={`q-${index}`} className="quiz-card">
                  <div className="quiz-progress">
                    <span>Question {index + 1} of {questions.length}</span>
                    <span>{Number.isInteger(selectedAnswers[question.id]) ? 'Answered' : 'Pending'}</span>
                  </div>
                  <p className="quiz-q">{question.q}</p>
                  <div className="quiz-options">
                    {question.options.map((option, optionIndex) => {
                      const selected = selectedAnswers[question.id] === optionIndex;
                      return (
                        <button
                          type="button"
                          key={optionIndex}
                          className={`quiz-option ${selected ? 'selected' : ''}`}
                          onClick={() => selectAnswer(question.id, optionIndex)}
                        >
                          <span className="letter">{LETTERS[optionIndex]}</span>
                          <span>{option}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
