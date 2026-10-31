const DEMO_MODE_KEY = 'demoMode';

export const isDemoModeAllowed = (): boolean => import.meta.env.DEV;

export const isDemoModeEnabled = (): boolean =>
  isDemoModeAllowed() && localStorage.getItem(DEMO_MODE_KEY) === 'true';

export const enableDemoMode = (): void => {
  if (!isDemoModeAllowed()) return;
  localStorage.setItem(DEMO_MODE_KEY, 'true');
  window.dispatchEvent(new Event('demoModeChanged'));
};

export const disableDemoMode = (): void => {
  localStorage.removeItem(DEMO_MODE_KEY);
  window.dispatchEvent(new Event('demoModeChanged'));
};
