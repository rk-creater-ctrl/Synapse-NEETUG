import { Injectable } from '@nestjs/common';
import { RevisionType } from '@prisma/client';

import { PhysicsDailyStudyStrategy } from './physics-daily-study.strategy';

export const biologyDailyTargets = {
  questions: 10,
  flashcards: 8,
  revisionItems: 4,
  videos: 1,
} as const;

/**
 * Biology retains the shared student-safe selection mechanics while making
 * existing fact/NCERT/short-note revision types and recall heavier quotas
 * explicit. No text-based biology classification is inferred.
 */
@Injectable()
export class BiologyDailyStudyStrategy extends PhysicsDailyStudyStrategy {
  protected override readonly targets = biologyDailyTargets;

  protected override revisionPriority(type: RevisionType): number {
    if (type === RevisionType.BIOLOGY_FACT) {
      return 3;
    }
    if (type === RevisionType.NCERT_HIGHLIGHT) {
      return 2;
    }
    if (type === RevisionType.SHORT_NOTE) {
      return 1;
    }
    return 0;
  }
}
