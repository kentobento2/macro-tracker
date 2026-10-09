import { useEntries, useProfileState } from '@/data/data-provider';
import { formatWeekRange, startOfWeek, weekOf, type DateKey } from '@/lib/dates';
import { averageOverLoggedDays } from '@/lib/entries';

import { NutritionSummary } from './nutrition-summary';

/** Average daily intake for the Mon–Sun week containing `date`, counting only logged days. */
export function WeekSummary({ date, today }: { date: DateKey; today: DateKey }) {
  const week = weekOf(date);
  const { entries } = useEntries(week);
  const { profile } = useProfileState();
  // Days after today haven't happened yet, so they don't count toward "of N days".
  const elapsed = week.filter((d) => d <= today);
  const { average, daysLogged } = averageOverLoggedDays(entries, elapsed);
  const label = startOfWeek(date) === startOfWeek(today) ? 'This week' : formatWeekRange(date);

  return (
    <NutritionSummary
      title={`${label} · daily average · ${daysLogged} of ${elapsed.length} days logged`}
      consumed={average}
      targets={profile?.targets ?? null}
    />
  );
}
