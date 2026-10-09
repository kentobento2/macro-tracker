// The "Get started" checklist on the Log screen. Pure: the screen gathers the facts, this decides what to show.

export type OnboardingStepId = 'targets' | 'install' | 'log' | 'assistant';

export type OnboardingFacts = {
  hasTargets: boolean;
  /** Running from the home screen. null when it can't apply (native app) or isn't known yet. */
  installed: boolean | null;
  hasLoggedFood: boolean;
  /** The user opened the assistant instructions (there's no way to detect a connection from the app). */
  assistantSeen: boolean;
  /** The user hid the checklist. */
  dismissed: boolean;
};

export type OnboardingStep = { id: OnboardingStepId; done: boolean; optional: boolean };

export function onboardingSteps(f: OnboardingFacts): OnboardingStep[] {
  return [
    { id: 'targets', done: f.hasTargets, optional: false },
    // Installing only applies to the web app; elsewhere it counts as done.
    { id: 'install', done: f.installed !== false, optional: false },
    { id: 'log', done: f.hasLoggedFood, optional: false },
    { id: 'assistant', done: f.assistantSeen, optional: true },
  ];
}

/** Shown until it's hidden or every required step is done. */
export function showOnboarding(f: OnboardingFacts): boolean {
  return !f.dismissed && onboardingSteps(f).some((s) => !s.optional && !s.done);
}

/** "2 of 3": required steps done out of required steps. */
export function onboardingProgress(f: OnboardingFacts): { done: number; total: number } {
  const required = onboardingSteps(f).filter((s) => !s.optional);
  return { done: required.filter((s) => s.done).length, total: required.length };
}
