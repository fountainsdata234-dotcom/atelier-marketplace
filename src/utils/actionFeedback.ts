export type ActionFeedbackKind = 'save' | 'download';

export const animateActionFeedback = (button: HTMLElement | null, kind: ActionFeedbackKind) => {
  if (!button || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const bounds = button.getBoundingClientRect();
  const icon = button.querySelector('svg');
  if (!icon || bounds.width === 0 || bounds.height === 0) return;

  button.animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(-5px)' },
    { transform: 'translateY(0)' },
    { transform: 'translateY(-5px)' },
    { transform: 'translateY(0)' },
  ], {
    duration: 440,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  });

  const float = document.createElement('span');
  float.className = `action-feedback-float action-feedback-float--${kind}`;
  float.style.left = `${bounds.left + bounds.width / 2 - 25}px`;
  float.style.top = `${bounds.top + bounds.height / 2 - 25}px`;

  const liquid = document.createElement('span');
  liquid.className = 'action-feedback-liquid';
  liquid.append(document.createElement('span'));
  const floatingIcon = icon.cloneNode(true) as SVGSVGElement;
  floatingIcon.setAttribute('class', 'action-feedback-icon');
  liquid.append(floatingIcon);
  float.append(liquid);
  document.body.append(float);

  const targetLeft = kind === 'save' ? 18 : window.innerWidth - 68;
  const targetTop = 24;
  const deltaX = targetLeft - (bounds.left + bounds.width / 2 - 25);
  const deltaY = targetTop - (bounds.top + bounds.height / 2 - 25);
  const animation = float.animate([
    { transform: 'translate3d(0, 0, 0) scale(0.55)', opacity: 0.22, offset: 0 },
    { transform: `translate3d(${deltaX * 0.38}px, ${deltaY * 0.38}px, 0) scale(1.05)`, opacity: 0.94, offset: 0.32 },
    { transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(0.3)`, opacity: 0, offset: 1 },
  ], {
    duration: 900,
    easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)',
  });
  animation.onfinish = () => float.remove();
  window.setTimeout(() => float.remove(), 1_100);
};
