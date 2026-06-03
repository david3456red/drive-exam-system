import type { ComponentProps } from 'react';
import Link from 'next/link';
import { RotateCcw, Trash2 } from 'lucide-react';

import { abandonAttemptAction } from './actions';

type FormAction = NonNullable<ComponentProps<'form'>['action']>;

type OngoingAttemptActionsProps = {
  attemptId: string;
  label: string;
  abandonAction?: FormAction;
};

export function OngoingAttemptActions({
  attemptId,
  label,
  abandonAction = abandonAttemptAction,
}: OngoingAttemptActionsProps) {
  return (
    <div className="cluster">
      <Link className="button primary" href={`/exam/session/${attemptId}`}>
        <RotateCcw size={17} aria-hidden="true" />
        继续{label}
      </Link>
      <form action={abandonAction}>
        <input type="hidden" name="attemptId" value={attemptId} />
        <button className="ghost" type="submit">
          <Trash2 size={17} aria-hidden="true" />
          放弃
        </button>
      </form>
    </div>
  );
}
