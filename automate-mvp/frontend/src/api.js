const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const opts = {
    method: options.method || 'GET',
    credentials: 'include',
    headers: { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) },
    body: options.body ? (isFormData ? options.body : JSON.stringify(options.body)) : undefined,
    signal: options.signal,
  };
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data && data.detail;
    const message = (detail && typeof detail === 'object' ? detail.message : detail) || res.statusText || 'Request failed';
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  getDepartments: () => request('/departments'),
  getDepartment: (slug) => request(`/departments/${slug}`),

  startEligibility: (candidateId, departmentSlug, signal) =>
    request('/eligibility/start', { method: 'POST', body: { candidateId, departmentSlug }, signal }),
  submitEligibility: (candidateId, departmentSlug, answers) =>
    request('/eligibility/submit', {
      method: 'POST',
      body: { candidateId, departmentSlug, answers },
    }),
  getEligibilityStatus: (candidateId, departmentSlug) =>
    request(`/eligibility/status?candidateId=${encodeURIComponent(candidateId)}&departmentSlug=${encodeURIComponent(departmentSlug)}`),

  createStudent: (payload) =>
    request('/students', { method: 'POST', body: payload }),
  getStudent: (regNo) => request(`/students/${encodeURIComponent(regNo)}`),

  initializePayment: (regNo, email, amount) =>
    request('/payment/initialize', {
      method: 'POST',
      body: { regNo, email, amount },
    }),
  verifyPayment: (regNo, reference) =>
    request('/payment/verify', { method: 'POST', body: { regNo, reference } }),

  adminLogin: (username, password) =>
    request('/admin/login', { method: 'POST', body: { username, password } }),
  adminLogout: () => request('/admin/logout', { method: 'POST' }),
  adminSession: () => request('/admin/session'),
  adminSummary: () => request('/admin/summary'),
  adminStudents: () => request('/admin/students'),
  adminUpdateCapacity: (slug, capacity) =>
    request(`/admin/departments/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      body: { capacity },
    }),
  adminPricing: () => request('/admin/pricing'),
  adminUpdateItPrice: (amount) => request('/admin/pricing/it', {
    method: 'PUT', body: { amount },
  }),
  adminUpdateGeneralPrice: (departmentSlug, courseSlug, classType, amount) => request('/admin/pricing/general', {
    method: 'PUT', body: { departmentSlug, courseSlug, classType, amount },
  }),
  adminDepartmentQuestions: (slug) => request(`/admin/departments/${encodeURIComponent(slug)}/questions`),
  adminAddDepartmentQuestion: (slug, question) => request(`/admin/departments/${encodeURIComponent(slug)}/questions`, {
    method: 'POST', body: question,
  }),
  adminUpdateDepartmentQuestion: (slug, questionId, question) => request(`/admin/departments/${encodeURIComponent(slug)}/questions/${encodeURIComponent(questionId)}`, {
    method: 'PUT', body: question,
  }),
  adminDeleteDepartmentQuestion: (slug, questionId) => request(`/admin/departments/${encodeURIComponent(slug)}/questions/${encodeURIComponent(questionId)}`, {
    method: 'DELETE',
  }),
  adminImportBatches: () => request('/admin/imports'),
  adminImportBatch: (batchId) => request(`/admin/imports/${batchId}`),
  adminImportFile: (formData) => request('/admin/imports/files', { method: 'POST', body: formData }),
  adminImportScan: (formData) => request('/admin/imports/scans', { method: 'POST', body: formData }),
  adminImportUpdate: (rowId, data) => request(`/admin/imports/rows/${rowId}`, {
    method: 'PUT', body: { data },
  }),
  adminImportSkip: (rowId) => request(`/admin/imports/rows/${rowId}/skip`, { method: 'POST' }),
  adminImportApprove: (rowId) => request(`/admin/imports/rows/${rowId}/approve`, { method: 'POST' }),
  adminImportCommit: (batchId) => request(`/admin/imports/${batchId}/import`, { method: 'POST' }),
  adminImportImageUrl: (batchId) => `${BASE}/admin/imports/${batchId}/document`,
  adminImportPreviewUrl: (batchId) => `${BASE}/admin/imports/${batchId}/preview`,
  adminStudentDocumentUrl: (studentId) => `${BASE}/admin/imports/students/${studentId}/document`,
};
