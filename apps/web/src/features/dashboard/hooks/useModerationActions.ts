import type { AccessibleChannel, SubmissionSummary } from '@tmw/shared';
import { approveSubmission, banUser, rejectSubmission, skipCurrent, uploadMedia } from '@/lib/api';
import { useApiAction } from '@/hooks/useApiAction';
import { useConfirm } from '@/providers/ConfirmProvider';
import { useI18n } from '@/i18n';

export function useModerationActions({
  channelId,
  current,
  refreshLists,
}: {
  channelId: string | null;
  current: AccessibleChannel | null;
  refreshLists: () => void;
}) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const act = useApiAction();

  const onApprove = (s: SubmissionSummary) => {
    if (channelId)
      void act(() => approveSubmission(channelId, s.id, false), { success: t('toast.approved') });
  };
  const onTrust = (s: SubmissionSummary) => {
    if (channelId)
      void act(() => approveSubmission(channelId, s.id, true), {
        after: refreshLists,
        success: t('toast.approved'),
      });
  };
  const onReject = (s: SubmissionSummary) => {
    if (channelId)
      void act(() => rejectSubmission(channelId, s.id, false), { success: t('toast.rejected') });
  };
  const onBan = (s: SubmissionSummary) => {
    void (async () => {
      if (!channelId) return;
      const name = s.senderName ?? t('dash.thisSender');
      if (
        await confirm({
          message: t('dash.banConfirm', { name }),
          confirmLabel: t('dash.ban'),
          danger: true,
        })
      ) {
        void act(() => rejectSubmission(channelId, s.id, true), {
          after: refreshLists,
          success: t('toast.banned'),
        });
      }
    })();
  };
  const banById = (userId: string, name: string) => {
    void (async () => {
      if (!channelId) return;
      if (
        await confirm({
          message: t('dash.banConfirm', { name }),
          confirmLabel: t('dash.ban'),
          danger: true,
        })
      ) {
        void act(() => banUser(channelId, userId), {
          after: refreshLists,
          success: t('toast.banned'),
        });
      }
    })();
  };
  const skip = () => {
    if (channelId) void act(() => skipCurrent(channelId), { success: t('toast.skipped') });
  };
  const sendTest = (file: File) => {
    if (!current) return Promise.resolve();
    return act(() => uploadMedia(current.login, file), { success: t('toast.testSent') });
  };

  return { onApprove, onTrust, onReject, onBan, banById, skip, sendTest };
}
