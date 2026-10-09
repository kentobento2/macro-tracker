import { onboardingProgress, onboardingSteps, showOnboarding, type OnboardingFacts } from '../onboarding';

const fresh: OnboardingFacts = {
  hasTargets: false,
  installed: false,
  hasLoggedFood: false,
  assistantSeen: false,
  dismissed: false,
};

describe('onboarding checklist', () => {
  it('shows every step for a new user, with the assistant optional', () => {
    expect(onboardingSteps(fresh).map((s) => [s.id, s.done, s.optional])).toEqual([
      ['targets', false, false],
      ['install', false, false],
      ['log', false, false],
      ['assistant', false, true],
    ]);
    expect(showOnboarding(fresh)).toBe(true);
    expect(onboardingProgress(fresh)).toEqual({ done: 0, total: 3 });
  });

  it('disappears once the required steps are done, even if the assistant step is not', () => {
    const done = { ...fresh, hasTargets: true, installed: true, hasLoggedFood: true };
    expect(onboardingProgress(done)).toEqual({ done: 3, total: 3 });
    expect(showOnboarding(done)).toBe(false);
  });

  it('treats installing as done where it does not apply', () => {
    expect(onboardingSteps({ ...fresh, installed: null })[1].done).toBe(true);
  });

  it('stays hidden after the user hides it', () => {
    expect(showOnboarding({ ...fresh, dismissed: true })).toBe(false);
  });
});
