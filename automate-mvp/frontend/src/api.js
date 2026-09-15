const BASE = '/api';

async function request(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
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
    const message = (data && data.detail) || res.statusText || 'Request failed';
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

  startEligibility: (candidateId, departmentSlug) =>
    request('/eligibility/start', { method: 'POST', body: { candidateId, departmentSlug } }),
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

  verifyPayment: (regNo) =>
    request('/payment/verify', { method: 'POST', body: { regNo } }),

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
};
