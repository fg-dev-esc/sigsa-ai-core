import { Queue } from 'bullmq';
import { createRedisConnection } from '../redis/redis.client';
import { queueNames } from './queue-names';
import type { IdentityIntakeJob } from '../../features/identity-intake/identity-intake.job';

export const identityIntakeQueue = new Queue<IdentityIntakeJob, void, string>(queueNames.identityIntake, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 1000,
    removeOnFail: 5000
  }
});
