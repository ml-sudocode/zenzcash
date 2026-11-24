// Preserve disclosure height and focus along with viewport and sidebar position.
const captureDetails = details => [...details].map(detail => ({ label: detail.querySelector('summary').textContent, open: detail.open }));
const pageDetails = root => [...root.querySelectorAll('details')].filter(detail => detail.closest('.post') === null);
function restoreDetails(details, saved) {
  const byLabel = new Map();
  for (const detail of saved) {
    if (!byLabel.has(detail.label)) byLabel.set(detail.label, []);
    byLabel.get(detail.label).push(detail.open);
  }
  for (const detail of details) {
    const matches = byLabel.get(detail.querySelector('summary').textContent);
    if (matches?.length) detail.open = matches.shift();
  }
}

export function captureReadingPosition(root) {
  const panel = root.querySelector('.settings-panel');
  return {
    x: window.scrollX,
    y: window.scrollY,
    panelScroll: panel === null ? null : panel.scrollTop,
    focusedPost: document.activeElement.closest('.post')?.id ?? null,
    focusedId: document.activeElement.id || null,
    details: captureDetails(pageDetails(root)),
    posts: [...root.querySelectorAll('.post')].map(post => ({
      id: post.id,
      details: captureDetails(post.querySelectorAll('details')),
    })).filter(post => post.details.some(detail => detail.open)),
  };
}

export function restoreReadingPosition(root, position) {
  restoreDetails(pageDetails(root), position.details);
  for (const saved of position.posts) {
    const post = document.getElementById(saved.id);
    if (post === null) continue; // A successful sign-in can apply different saved filters.
    restoreDetails(post.querySelectorAll('details'), saved.details);
  }
  const panel = root.querySelector('.settings-panel');
  if (panel !== null && position.panelScroll !== null) panel.scrollTop = position.panelScroll;
  const focused = position.focusedId === null ? null : document.getElementById(position.focusedId);
  if (focused !== null) focused.focus({ preventScroll: true });
  else if (position.focusedPost !== null) document.getElementById(position.focusedPost)?.focus({ preventScroll: true });
  window.scrollTo(position.x, position.y);
}
