import { useMeContext } from '@/providers/MeProvider';

/**
 * Текущая сессия (getMe) с флагом загрузки и ручным refresh.
 * Тонкий фасад над MeProvider — единый источник правды для всех страниц/оболочки.
 */
export function useMe() {
  return useMeContext();
}
