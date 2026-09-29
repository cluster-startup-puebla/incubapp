'use client';

import { IncubadoraDetail } from '../incubadoras/[id]/incubadora-detail';

export type IncubadoraOwnPageProps = {
  incubatorId: string;
  canEdit?: boolean;
};

export function IncubadoraOwnPage({
  incubatorId,
  canEdit = true,
}: IncubadoraOwnPageProps) {
  return (
    <IncubadoraDetail
      id={incubatorId}
      canEdit={canEdit}
      incubatorId={incubatorId}
    />
  );
}
