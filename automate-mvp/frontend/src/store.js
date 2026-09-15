const KEY = 'automate-hub-state';

function read() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function write(value) {
  sessionStorage.setItem(KEY, JSON.stringify(value || {}));
}

export function newCandidateId() {
  return 'cand_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function getState() {
  const s = read();
  if (!s.candidateId) {
    s.candidateId = newCandidateId();
    write(s);
  }
  return s;
}

export function patchState(patch) {
  const s = read();
  const next = { ...s, ...patch };
  write(next);
  return next;
}

export function resetAttempts() {
  const s = read();
  delete s.attemptsResetAt;
  write(s);
}

export function clearState() {
  sessionStorage.removeItem(KEY);
}
