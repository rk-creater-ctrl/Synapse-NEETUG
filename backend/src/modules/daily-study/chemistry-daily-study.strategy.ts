import { Injectable } from '@nestjs/common';
import { RevisionType } from '@prisma/client';

import { PhysicsDailyStudyStrategy } from './physics-daily-study.strategy';

export const chemistryDailyTargets = {
  questions: 10,
  flashcards: 5,
  revisionItems: 3,
  videos: 1,
} as const;

/**
 * Chemistry uses the proven student-visible, weak-topic, PYQ-aware mechanics
 * from Physics. RevisionItem has no Chemistry-specific reaction/formula
 * classification beyond its existing type/hierarchy, so this strategy raises
 * the revision quota while retaining weak-topic-first deterministic ordering.
 */
@Injectable()
export class ChemistryDailyStudyStrategy extends PhysicsDailyStudyStrategy {
  protected override readonly targets = chemistryDailyTargets;

  protected override revisionPriority(type: RevisionType): number {
    if (type === RevisionType.REACTION) {
      return 2;
    }
    if (type === RevisionType.FORMULA) {
      return 1;
    }
    return 0;
  }
}
