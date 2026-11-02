import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Users, ArrowLeft, Search } from 'lucide-react';
import StepIndicator from '../components/StepIndicator.jsx';
import { api } from '../api.js';
import { getState } from '../store.js';
import { useToast } from '../components/Toast.jsx';

const STEPS = ['Category', 'Department', 'Eligibility', 'Bio-data', 'Payment'];

export default function DepartmentSelect() {
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const state = getState();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!state.category) {
      navigate('/capture');
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.getDepartments();
        if (!cancelled) setDepartments(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load departments');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [navigate, state.category]);

  function chooseCourse(d, course = null, classType = null) {
    if (d.isFull) {
      toast.push({ kind: 'error', title: 'Department full', message: `${d.name} has no slots left — pick another program.` });
      return;
    }
    const item = course || d;
    const options = item.price_options || {};
    const requiresMode = Number.isFinite(options.physical) || Number.isFinite(options.virtual);
    if (requiresMode && !classType) return;
    const amount = state.category === 'IT'
      ? (d.itUnifiedPrice ?? 22000)
      : requiresMode ? options[classType] : (item.price ?? d.generalPrice);
    if (!Number.isFinite(amount)) return;
    setSelection({
      department: d,
      course,
      classType,
      amount,
      durationWeeks: item.durationWeeks ?? d.durationWeeks ?? null,
    });
  }

  function continueToEligibility() {
    if (!selection) {
      toast.push({ kind: 'error', title: 'Choose a course', message: 'Select a course and price option to continue.' });
      return;
    }
    const nextState = {
      ...state,
      department: selection.department,
      courseSelection: {
        selected_subcourse: selection.course?.slug || null,
        selected_subcourse_name: selection.course?.name || selection.department.name,
        class_type: selection.classType,
        amount: selection.amount,
        duration_weeks: selection.durationWeeks,
      },
      step: 2,
    };
    sessionStorage.setItem('automate-hub-state', JSON.stringify(nextState));
    navigate('/capture/eligibility');
  }

  const allFull = useMemo(() => departments.length > 0 && departments.every((d) => d.isFull), [departments]);
  const visibleDepartments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return departments;
    return departments.filter((department) => (
      department.name.toLowerCase().includes(term)
      || (department.subcourses || []).some((course) => course.name.toLowerCase().includes(term))
    ));
  }, [departments, search]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Step 2 · Pick a department</h1>
          <p>Each program has a limited number of seats. Live capacity is shown below.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/capture')}>
          <ArrowLeft size={14} style={{ marginRight: 6 }} /> Back
        </button>
      </div>

      <StepIndicator steps={STEPS} activeIndex={1} />

      {error && (
        <div className="warning-banner">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {allFull && (
        <div className="warning-banner" style={{ background: 'rgba(255,85,119,0.12)', borderColor: 'rgba(255,85,119,0.4)', color: '#ff5577' }}>
          <AlertTriangle size={18} />
          All departments are currently full. Please check back later.
        </div>
      )}

      <div className="dept-toolbar">
        <label className="dept-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search departments and courses"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search departments or courses"
            type="search"
            value={search}
          />
        </label>
        <span className="dept-count">{visibleDepartments.length} of {departments.length} programs</span>
      </div>

      <div className="dept-grid">
        {visibleDepartments.map((d) => {
          const term = search.trim().toLowerCase();
          const allCourses = d.has_subcourses ? (d.subcourses || []) : [d];
          const courses = term && !d.name.toLowerCase().includes(term)
            ? allCourses.filter((course) => course.name.toLowerCase().includes(term))
            : allCourses;
          return (
            <section className={`dept-card ${d.isFull ? 'full' : ''}`} key={d.slug}>
              <div className="dept-head">
                <div className="dept-card-main">
                  <h3>{d.name}</h3>
                  <div className="dept-meta">{d.has_subcourses ? `${allCourses.length} course options` : 'Course'}</div>
                </div>
                <div className={`slots-pill ${d.isFull ? 'full' : ''}`}>
                  <Users size={12} /> {d.isFull ? 'Full' : `${d.slotsRemaining} left`}
                </div>
              </div>
              {d.isFull && <p className="dept-full-note">No seats currently available</p>}
              <div className="dept-course-list">
                {courses.map((course) => {
                  const options = course.price_options || {};
                  const modes = ['physical', 'virtual'].filter((mode) => Number.isFinite(options[mode]));
                  const isSelectedCourse = selection?.department.slug === d.slug
                    && (selection.course?.slug || null) === (course.slug === d.slug ? null : course.slug);
                  return (
                    <div className={`dept-course ${isSelectedCourse ? 'selected' : ''}`} key={course.slug || d.slug}>
                      <div className="dept-course-title">
                        <strong>{course.name}</strong>
                        {course.durationWeeks && <span>{course.durationWeeks} weeks</span>}
                      </div>
                      {modes.length ? (
                        <div className="course-mode-options" aria-label={`${course.name} class type and price`}>
                          {modes.map((mode) => (
                            <button
                              aria-pressed={isSelectedCourse && selection.classType === mode}
                              className={`course-mode ${isSelectedCourse && selection.classType === mode ? 'active' : ''}`}
                              disabled={d.isFull}
                              key={mode}
                              onClick={() => chooseCourse(d, course.slug === d.slug ? null : course, mode)}
                              type="button"
                            >
                              <span>{mode === 'physical' ? 'Physical' : 'Virtual'}</span>
                              <strong>NGN {(state.category === 'IT' ? (d.itUnifiedPrice ?? 22000) : options[mode]).toLocaleString('en-NG')}</strong>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          aria-pressed={isSelectedCourse}
                          className={`course-fixed-price ${isSelectedCourse ? 'active' : ''}`}
                          disabled={d.isFull}
                          onClick={() => chooseCourse(d, course.slug === d.slug ? null : course)}
                          type="button"
                        >
                          <span>Select course</span>
                          <strong>NGN {(state.category === 'IT' ? (d.itUnifiedPrice ?? 22000) : (course.price ?? d.generalPrice)).toLocaleString('en-NG')}</strong>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!loading && visibleDepartments.length === 0 && (
          <p className="dept-empty">No departments or courses match “{search}”.</p>
        )}
      </div>

      <div className="dept-selection-bar">
        <div>
          <strong>{selection ? selection.course?.name || selection.department.name : 'No course selected'}</strong>
          {selection && <span>{selection.classType ? ` · ${selection.classType}` : ''}{selection.durationWeeks ? ` · ${selection.durationWeeks} weeks` : ''} · NGN {selection.amount.toLocaleString('en-NG')}</span>}
        </div>
        <button className="btn btn-primary" disabled={!selection} onClick={continueToEligibility} type="button">
          Continue to eligibility
        </button>
      </div>

      {loading && (
        <div className="flex-center mt-24 text-dim">
          <div className="spinner" /> Loading departments…
        </div>
      )}
    </div>
  );
}
