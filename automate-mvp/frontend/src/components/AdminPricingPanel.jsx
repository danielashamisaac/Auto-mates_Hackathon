import { useEffect, useMemo, useState } from 'react';
import { DollarSign, RefreshCw, Save } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';

function courseKey(departmentSlug, courseSlug, classType = 'fixed') {
  return `${departmentSlug}:${courseSlug || 'main'}:${classType}`;
}

export default function AdminPricingPanel() {
  const [pricing, setPricing] = useState(null);
  const [itPrice, setItPrice] = useState('22000');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();

  async function loadPricing() {
    setLoading(true);
    try {
      const result = await api.adminPricing();
      setPricing(result);
      setItPrice(String(result.itUnifiedPrice));
      setSelectedDepartment((current) => current || result.departments[0]?.slug || '');
      const values = {};
      result.departments.forEach((department) => department.courses.forEach((course) => {
        const options = course.price_options || {};
        if (Object.keys(options).length) {
          Object.entries(options).forEach(([mode, amount]) => {
            values[courseKey(department.slug, course.slug, mode)] = String(amount);
          });
        } else {
          values[courseKey(department.slug, course.slug)] = String(course.price ?? '');
        }
      }));
      setDrafts(values);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load pricing.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPricing();
  }, []);

  const department = useMemo(
    () => pricing?.departments.find((item) => item.slug === selectedDepartment),
    [pricing, selectedDepartment],
  );

  async function saveItPrice(event) {
    event.preventDefault();
    const amount = Number(itPrice);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      toast.push({ kind: 'error', title: 'Invalid IT price', message: 'Enter a whole amount of 0 or greater.' });
      return;
    }
    setSaving('it');
    try {
      const result = await api.adminUpdateItPrice(amount);
      setPricing((current) => ({ ...current, itUnifiedPrice: result.itUnifiedPrice }));
      setItPrice(String(result.itUnifiedPrice));
      toast.push({ kind: 'success', title: 'IT price updated', message: `All IT registrations now use NGN ${result.itUnifiedPrice.toLocaleString('en-NG')}.` });
    } catch (err) {
      toast.push({ kind: 'error', title: 'Could not update IT price', message: err.message });
    } finally {
      setSaving('');
    }
  }

  async function saveGeneralPrice(course, classType = null) {
    const key = courseKey(department.slug, course.slug, classType || 'fixed');
    const amount = Number(drafts[key]);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      toast.push({ kind: 'error', title: 'Invalid course price', message: 'Enter a whole amount of 0 or greater.' });
      return;
    }
    setSaving(key);
    try {
      await api.adminUpdateGeneralPrice(department.slug, course.slug, classType, amount);
      await loadPricing();
      toast.push({ kind: 'success', title: 'General price updated', message: `${course.name}${classType ? ` (${classType})` : ''} is now NGN ${amount.toLocaleString('en-NG')}.` });
    } catch (err) {
      toast.push({ kind: 'error', title: 'Could not update course price', message: err.message });
    } finally {
      setSaving('');
    }
  }

  return (
    <section className="section pricing-management">
      <div className="pricing-heading">
        <div>
          <h2>Registration pricing</h2>
          <p className="text-dim">Manage the flat IT fee and General course prices.</p>
        </div>
        <button className="btn btn-ghost" type="button" title="Refresh pricing" aria-label="Refresh pricing" onClick={loadPricing} disabled={loading || Boolean(saving)}>
          <RefreshCw size={15} />
        </button>
      </div>

      {error && <div className="warning-banner" role="alert">{error}</div>}
      {loading && <div className="text-dim">Loading pricing…</div>}
      {!loading && pricing && (
        <>
          <form className="it-price-row" onSubmit={saveItPrice}>
            <div className="it-price-copy">
              <span className="it-price-icon"><DollarSign size={16} /></span>
              <div><strong>IT Student · unified price</strong><small>Applies to all 21 departments and their subcourses.</small></div>
            </div>
            <div className="price-edit-control">
              <span>NGN</span>
              <input aria-label="Unified IT student price" min="0" step="1" type="number" value={itPrice} onChange={(event) => setItPrice(event.target.value)} />
              <button className="btn btn-primary" type="submit" disabled={saving === 'it'}><Save size={14} /> Save IT price</button>
            </div>
          </form>

          <div className="general-pricing-heading">
            <div><h3>General Student · course prices</h3><p className="text-dim">Physical and virtual prices are managed separately where both are offered.</p></div>
            <label>
              <span>Department</span>
              <select value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)}>
                {pricing.departments.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
              </select>
            </label>
          </div>

          <div className="general-price-list">
            {department?.courses.map((course) => {
              const options = course.price_options || {};
              const modes = ['physical', 'virtual'].filter((mode) => Number.isSafeInteger(options[mode]));
              return (
                <div className="general-price-row" key={course.slug || department.slug}>
                  <div className="general-price-course"><strong>{course.name}</strong>{course.durationWeeks && <small>{course.durationWeeks} weeks</small>}</div>
                  {modes.length ? modes.map((mode) => {
                    const key = courseKey(department.slug, course.slug, mode);
                    return (
                      <div className="price-edit-control" key={mode}>
                        <label htmlFor={`price-${key}`}>{mode === 'physical' ? 'Physical' : 'Virtual'}</label>
                        <span>NGN</span>
                        <input id={`price-${key}`} aria-label={`${course.name} ${mode} price`} min="0" step="1" type="number" value={drafts[key] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} />
                        <button className="btn btn-ghost" type="button" onClick={() => saveGeneralPrice(course, mode)} disabled={saving === key}><Save size={13} /> Save</button>
                      </div>
                    );
                  }) : (() => {
                    const key = courseKey(department.slug, course.slug);
                    return (
                      <div className="price-edit-control">
                        <label htmlFor={`price-${key}`}>Course price</label>
                        <span>NGN</span>
                        <input id={`price-${key}`} aria-label={`${course.name} price`} min="0" step="1" type="number" value={drafts[key] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} />
                        <button className="btn btn-ghost" type="button" onClick={() => saveGeneralPrice(course)} disabled={saving === key}><Save size={13} /> Save</button>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
