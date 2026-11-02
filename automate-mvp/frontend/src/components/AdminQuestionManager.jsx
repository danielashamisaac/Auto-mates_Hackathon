import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';

const emptyQuestion = () => ({ q: '', options: ['', '', '', ''], answer: 0 });

function questionPayload(question) {
  return {
    q: question.q.trim(),
    options: question.options.map((option) => option.trim()),
    answer: Number(question.answer),
  };
}

export default function AdminQuestionManager() {
  const [departments, setDepartments] = useState([]);
  const [departmentSlug, setDepartmentSlug] = useState('');
  const [questions, setQuestions] = useState([]);
  const [draft, setDraft] = useState(emptyQuestion);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => {
    api.getDepartments()
      .then((result) => {
        setDepartments(result);
        if (result.length) setDepartmentSlug(result[0].slug);
      })
      .catch((err) => setError(err.message || 'Could not load departments.'));
  }, []);

  useEffect(() => {
    if (!departmentSlug) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    api.adminDepartmentQuestions(departmentSlug)
      .then((result) => { if (active) setQuestions(result.questions); })
      .catch((err) => { if (active) setError(err.message || 'Could not load questions.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [departmentSlug]);

  const activeCount = useMemo(() => questions.filter((question) => question.active).length, [questions]);

  async function reload() {
    if (!departmentSlug) return;
    setLoading(true);
    try {
      const result = await api.adminDepartmentQuestions(departmentSlug);
      setQuestions(result.questions);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load questions.');
    } finally {
      setLoading(false);
    }
  }

  async function saveQuestion(questionId, question) {
    setBusy(true);
    try {
      const result = await api.adminUpdateDepartmentQuestion(departmentSlug, questionId, questionPayload(question));
      setQuestions(result.questions);
      toast.push({ kind: 'success', title: 'Question saved', message: 'The department question bank was updated.' });
    } catch (err) {
      toast.push({ kind: 'error', title: 'Could not save question', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function addQuestion(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.adminAddDepartmentQuestion(departmentSlug, questionPayload(draft));
      setQuestions(result.questions);
      setDraft(emptyQuestion());
      toast.push({ kind: 'success', title: 'Question added', message: 'It is queued as a replacement question.' });
    } catch (err) {
      toast.push({ kind: 'error', title: 'Could not add question', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function deleteQuestion(question) {
    if (!window.confirm(`Delete “${question.q}”? A replacement must remain available.`)) return;
    setBusy(true);
    try {
      const result = await api.adminDeleteDepartmentQuestion(departmentSlug, question.id);
      setQuestions(result.questions);
      toast.push({ kind: 'success', title: 'Question deleted', message: 'The bank still contains 20 active questions.' });
    } catch (err) {
      toast.push({ kind: 'error', title: 'Could not delete question', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  const selectedDepartment = departments.find((department) => department.slug === departmentSlug);

  return (
    <section className="section question-management">
      <div className="question-management-heading">
        <div>
          <h2>Eligibility questions</h2>
          <p className="text-dim">Manage the 20 questions used for each department’s test.</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={reload} disabled={loading || busy} aria-label="Refresh questions" title="Refresh questions">
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="question-management-tools">
        <label>
          <span>Department</span>
          <select value={departmentSlug} onChange={(event) => setDepartmentSlug(event.target.value)} disabled={busy}>
            {departments.map((department) => <option key={department.slug} value={department.slug}>{department.name}</option>)}
          </select>
        </label>
        <div className="question-bank-status"><Check size={15} /> {activeCount} active · 20 required</div>
      </div>

      {error && <div className="warning-banner" role="alert">{error}</div>}
      {loading && <div className="text-dim">Loading question bank…</div>}
      {!loading && !error && (
        <>
          <div className="question-editor-list">
            {questions.map((question, index) => (
              <QuestionEditor
                busy={busy}
                index={index}
                key={question.id}
                onDelete={() => deleteQuestion(question)}
                onSave={(updated) => saveQuestion(question.id, updated)}
                question={question}
              />
            ))}
          </div>

          <form className="question-editor question-editor-new" onSubmit={addQuestion}>
            <div className="question-editor-title"><strong>Add replacement question</strong><span>Queued after the active 20</span></div>
            <label className="question-field">
              <span>Question</span>
              <textarea maxLength={500} required value={draft.q} onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))} />
            </label>
            <div className="question-options-grid">
              {draft.options.map((option, index) => (
                <label key={index}>
                  <span>Option {String.fromCharCode(65 + index)}</span>
                  <input maxLength={240} required value={option} onChange={(event) => setDraft((current) => ({
                    ...current,
                    options: current.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item),
                  }))} />
                </label>
              ))}
            </div>
            <div className="question-editor-actions">
              <label>
                <span>Correct option</span>
                <select value={draft.answer} onChange={(event) => setDraft((current) => ({ ...current, answer: Number(event.target.value) }))}>
                  {draft.options.map((_, index) => <option key={index} value={index}>{String.fromCharCode(65 + index)}</option>)}
                </select>
              </label>
              <button className="btn btn-primary" type="submit" disabled={busy || !departmentSlug}><Plus size={14} /> Add question</button>
            </div>
            {selectedDepartment && <p className="question-bank-note">New questions are replacements; the live test stays at 20 questions.</p>}
          </form>
        </>
      )}
    </section>
  );
}

function QuestionEditor({ question, index, busy, onSave, onDelete }) {
  const [draft, setDraft] = useState(question);

  useEffect(() => setDraft(question), [question]);

  function updateOption(optionIndex, value) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, index) => index === optionIndex ? value : option),
    }));
  }

  return (
    <form className={`question-editor ${question.active ? '' : 'question-editor-queued'}`} onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
      <div className="question-editor-title">
        <strong>{question.active ? `Question ${index + 1}` : 'Replacement question'}</strong>
        <span>{question.active ? 'In test' : 'Queued'}</span>
      </div>
      <label className="question-field">
        <span>Question</span>
        <textarea maxLength={500} required value={draft.q} onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))} />
      </label>
      <div className="question-options-grid">
        {draft.options.map((option, optionIndex) => (
          <label key={optionIndex}>
            <span>Option {String.fromCharCode(65 + optionIndex)}</span>
            <input maxLength={240} required value={option} onChange={(event) => updateOption(optionIndex, event.target.value)} />
          </label>
        ))}
      </div>
      <div className="question-editor-actions">
        <label>
          <span>Correct option</span>
          <select value={draft.answer} onChange={(event) => setDraft((current) => ({ ...current, answer: Number(event.target.value) }))}>
            {draft.options.map((_, optionIndex) => <option key={optionIndex} value={optionIndex}>{String.fromCharCode(65 + optionIndex)}</option>)}
          </select>
        </label>
        <div className="question-editor-buttons">
          <button className="btn btn-ghost" type="button" onClick={onDelete} disabled={busy} title="Delete question" aria-label="Delete question"><Trash2 size={14} /> Delete</button>
          <button className="btn btn-primary" type="submit" disabled={busy}><Save size={14} /> Save</button>
        </div>
      </div>
    </form>
  );
}
