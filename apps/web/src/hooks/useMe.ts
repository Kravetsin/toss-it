import { useMeContext } from '@/providers/MeProvider';

/** Current session (getMe) with loading flag and manual refresh; thin facade over MeProvider. */
export function useMe() {
  return useMeContext();
}
