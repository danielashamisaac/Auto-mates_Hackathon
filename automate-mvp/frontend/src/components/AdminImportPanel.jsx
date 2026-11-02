import { useEffect, useState } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Save, SkipForward, Upload } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';

const PAGE_SIZE = 25;
const FIELDS = [
  ['reg_no', 'Registration number'],
  ['full_name', 'Full name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['category', 'Category'],
  ['department_slug', 'Department slug'],
  ['amount', 'Amount'],
];

export default function AdminImportPanel({ onImportComplete }) {
  const [batches, setBatches] = useState([]);
  const [batch, setBatch] = useState(null);
  const [page, setPage] = useState(0);
  const [file, setFile] = useState(null);
  const [selectedScanRowId, setSelectedScanRowId] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function loadBatches() {
    const result = await api.adminImportBatches();
    setBatches(result);
  }

  useEffect(() => {
    loadBatches().catch((error) => toast.push({ kind: 'error', title: 'Import history unavailable', message: error.message }));
  }, []);

  async function openBatch(batchId) {
    setBusy(true);
    try {
      const openedBatch = await api.adminImportBatch(batchId);
      setBatch(openedBatch);
      setPage(0);
      setSelectedScanRowId(openedBatch.rows[0]?.id ?? null);
    } catch (error) {
      toast.push({ kind: 'error', title: 'Could not open batch', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(event) {
    event.preventDefault();
    if (!file) return;
    const formElement = event.currentTarget;
    const formData = new FormData();
    formData.append('file', file);
    const isScan = /\.(pdf|png|jpe?g|tiff?|webp)$/i.test(file.name);
    setBusy(true);
    try {
      const result = isScan ? await api.adminImportScan(formData) : await api.adminImportFile(formData);
      setBatch(result);
      setPage(0);
      setSelectedScanRowId(result.rows[0]?.id ?? null);
      setFile(null);
      formElement.reset();
      await loadBatches();
      toast.push({ kind: 'success', title: isScan ? 'Scan processed' : 'Preview ready', message: `${result.rows.length} ${isScan ? 'pages' : 'rows'} staged for review.` });
    } catch (error) {
      toast.push({ kind: 'error', title: 'Upload failed', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveRow(row, form) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.amount = data.amount === '' ? null : Number(data.amount);
    data.paid = data.paid === 'true';
    setBusy(true);
    try {
      const updated = await api.adminImportUpdate(row.id, data);
      setBatch((current) => ({
        ...current,
        rows: current.rows.map((item) => item.id === row.id ? updated : item),
      }));
      await loadBatches();
      toast.push({ kind: 'success', title: 'Row updated', message: `Row ${row.row_number} was revalidated.` });
    } catch (error) {
      toast.push({ kind: 'error', title: 'Could not save row', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function skipRow(row) {
    setBusy(true);
    try {
      await api.adminImportSkip(row.id);
      await openBatch(batch.id);
      await loadBatches();
      toast.push({ kind: 'success', title: 'Row skipped', message: `Row ${row.row_number} will not be imported.` });
    } catch (error) {
      toast.push({ kind: 'error', title: 'Could not skip row', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function commitBatch() {
    if (!window.confirm('Import all currently valid rows into the official student database?')) return;
    setBusy(true);
    try {
      const result = await api.adminImportCommit(batch.id);
      setBatch(result.batch);
      await loadBatches();
      await onImportComplete?.();
      const blockedCount = result.blocked.length;
      toast.push({
        kind: blockedCount ? 'error' : 'success',
        title: blockedCount ? 'Some rows need attention' : 'Import complete',
        message: `${result.imported} imported${blockedCount ? `; ${blockedCount} blocked by validation or duplicates` : ''}.`,
      });
    } catch (error) {
      toast.push({ kind: 'error', title: 'Import failed', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function approveRow(row) {
    setBusy(true);
    try {
      const approved = await api.adminImportApprove(row.id);
      setBatch((current) => ({
        ...current,
        rows: current.rows.map((item) => item.id === row.id ? approved : item),
      }));
      await loadBatches();
      await onImportComplete?.();
      toast.push({ kind: 'success', title: 'Record approved', message: `${row.data.full_name || `Page ${row.row_number}`} was added to registrations.` });
    } catch (error) {
      toast.push({ kind: 'error', title: 'Approval blocked', message: error.message });
      if (error.data?.detail?.issues) {
        setBatch((current) => ({
          ...current,
          rows: current.rows.map((item) => item.id === row.id ? { ...item, issues: error.data.detail.issues } : item),
        }));
      }
    } finally {
      setBusy(false);
    }
  }

  const rows = batch?.rows || [];
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectedScanRow = rows.find((row) => row.id === selectedScanRowId) || visibleRows[0];
  const readyCount = rows.filter((row) => row.status === 'pending_review' && row.issues.length === 0).length;

  return (
    <section className="section import-section">
      <div className="import-heading">
        <div>
          <h2>Import registrations</h2>
          <p className="text-dim">Upload CSV/Excel records or scanned PDF/image forms. Review, correct, and validate every record before approval.</p>
        </div>
      </div>

      <form className="import-upload" onSubmit={uploadFile}>
        <label className="import-file-control">
          {file && /\.(pdf|png|jpe?g|tiff?|webp)$/i.test(file.name) ? <FileText size={18} /> : <FileSpreadsheet size={18} />}
          <span>{file?.name || 'Choose CSV, XLSX, PDF, or image files'}</span>
          <input type="file" accept=".csv,.xlsx,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={!file || busy}>
          <Upload size={15} /> Preview upload
        </button>
      </form>

      <div className="import-layout">
        <aside className="import-history" aria-label="Recent import batches">
          <h3>Recent batches</h3>
          {batches.length === 0 && <p className="text-dim">No imports yet.</p>}
          {batches.map((item) => (
            <button
              className={`import-batch-link ${batch?.id === item.id ? 'active' : ''}`}
              key={item.id}
              onClick={() => openBatch(item.id)}
              type="button"
            >
              <span>{item.original_filename}</span>
              <small>{item.row_count} rows · {item.pending_count} pending · {item.status}</small>
            </button>
          ))}
        </aside>

        <div className="import-preview">
          {!batch && <div className="import-empty">Choose a file to preview, or open a recent batch.</div>}
          {batch && (
            <>
              <div className="import-preview-head">
                <div>
                  <h3>{batch.original_filename}</h3>
                  <p className="text-dim">{rows.length} records · {readyCount} valid and ready · {batch.status}</p>
                </div>
                {batch.source_type === 'spreadsheet' && readyCount > 0 && (
                  <button className="btn btn-primary" type="button" onClick={commitBatch} disabled={busy}>
                    <Check size={15} /> Import {readyCount} valid rows
                  </button>
                )}
              </div>

              {batch.source_type === 'scan' && batch.document_url && (
                <div className="scan-comparison">
                  <div className="scan-source">
                    <div className="scan-panel-heading"><FileText size={15} /> Original document</div>
                    {/\.pdf$/i.test(batch.original_filename)
                      ? <iframe title={`Original scan: ${batch.original_filename}`} src={`${api.adminImportImageUrl(batch.id)}#page=${selectedScanRow?.row_number || 1}`} />
                      : <img src={api.adminImportPreviewUrl(batch.id)} alt={`Original scan: ${batch.original_filename}`} />}
                  </div>
                  <div className="scan-text">
                    <div className="scan-panel-heading">OCR text · page {selectedScanRow?.row_number || 1}</div>
                    <pre>{selectedScanRow?.source_text || 'No text was detected on this page. Enter the record details below.'}</pre>
                  </div>
                </div>
              )}

              {rows.length === 0 && <div className="import-empty">This batch has no records.</div>}
              <div className="import-row-list">
                {visibleRows.map((row) => (
                  <form
                    className={`import-row ${row.issues.length ? 'has-issues' : ''} ${row.status !== 'pending_review' ? 'is-final' : ''}`}
                    key={row.id}
                    onSubmit={(event) => { event.preventDefault(); saveRow(row, event.currentTarget); }}
                  >
                    <div className="import-row-head">
                      <strong>Row {row.row_number}</strong>
                      {batch.source_type === 'scan' && <button className="btn btn-ghost" type="button" onClick={() => setSelectedScanRowId(row.id)}>Compare source</button>}
                      {row.status === 'imported' && <span className="import-state good"><Check size={13} /> Imported</span>}
                      {row.status === 'skipped' && <span className="import-state">Skipped</span>}
                      {row.status === 'pending_review' && row.issues.length > 0 && <span className="import-state bad"><AlertCircle size={13} /> Needs correction</span>}
                      {row.status === 'pending_review' && row.issues.length === 0 && <span className="import-state good"><Check size={13} /> Valid</span>}
                    </div>
                    <div className="import-fields">
                      {FIELDS.map(([field, label]) => (
                        <label key={field}>
                          <span>{label}</span>
                          <input
                            name={field}
                            defaultValue={row.data[field] ?? ''}
                            type={field === 'amount' ? 'number' : 'text'}
                            min={field === 'amount' ? '0' : undefined}
                            disabled={row.status !== 'pending_review' || busy}
                          />
                        </label>
                      ))}
                      <label>
                        <span>Payment</span>
                        <select name="paid" defaultValue={String(Boolean(row.data.paid))} disabled={row.status !== 'pending_review' || busy}>
                          <option value="false">Unpaid</option>
                          <option value="true">Paid</option>
                        </select>
                      </label>
                    </div>
                    {row.issues.length > 0 && <ul className="import-messages errors">{row.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
                    {row.warnings.length > 0 && <ul className="import-messages warnings">{row.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                    {row.status === 'pending_review' && (
                      <div className="import-row-actions">
                        <button className="btn btn-ghost" type="submit" disabled={busy}><Save size={14} /> Save and recheck</button>
                        <button className="btn btn-ghost" type="button" onClick={() => skipRow(row)} disabled={busy}><SkipForward size={14} /> Skip row</button>
                        {batch.source_type === 'scan' && <button className="btn btn-primary" type="button" onClick={() => approveRow(row)} disabled={busy || row.issues.length > 0}><Check size={14} /> Approve record</button>}
                      </div>
                    )}
                  </form>
                ))}
              </div>
              {rows.length > PAGE_SIZE && (
                <div className="import-pagination">
                  <button className="btn btn-ghost" type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} aria-label="Previous rows"><ChevronLeft size={16} /></button>
                  <span>Page {page + 1} of {pageCount}</span>
                  <button className="btn btn-ghost" type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page + 1 >= pageCount} aria-label="Next rows"><ChevronRight size={16} /></button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
