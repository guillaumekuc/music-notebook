let element: HTMLDivElement | null = null;
let timer: number | undefined;

// Shows a short message, optionally with an action button such as Undo.
export function toast(message: string, action?: { label: string; run: () => void }): void {
  if (!element) {
    element = document.createElement('div');
    element.className = 'toast';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    document.body.append(element);
  }
  const el = element;
  el.replaceChildren(Object.assign(document.createElement('span'), { textContent: message }));
  if (action) {
    const button = Object.assign(document.createElement('button'), {
      type: 'button',
      className: 'toast-action',
      textContent: action.label,
    });
    button.addEventListener('click', () => {
      action.run();
      el.classList.remove('visible');
    });
    el.append(button);
  }
  el.classList.add('visible');
  window.clearTimeout(timer);
  timer = window.setTimeout(() => el.classList.remove('visible'), action ? 6000 : 3000);
}
