import { Worker } from 'bullmq';
import { logError, logStep } from '../infra/logger/logger';
import { createRedisConnection } from '../infra/redis/redis.client';
import { queueNames } from '../infra/queues/queue-names';
import { ProcessIdentityIntakeUseCase } from '../features/identity-intake/process-identity-intake.usecase';
import type { IdentityIntakeJob } from '../features/identity-intake/identity-intake.job';

export function startIdentityIntakeWorker() {
  const processor = new ProcessIdentityIntakeUseCase();
  const connection = createRedisConnection();
  const worker = new Worker<IdentityIntakeJob, void, string>(
    queueNames.identityIntake,
    async (job) => {
      try {
        await processor.execute(job.data);
      } catch (error) {
        logError('worker', 'job failed', error, {
          caseId: job.data.caseId,
          jobId: job.id,
          caseVersion: job.data.caseVersion,
          correlationId: job.data.correlationId
        });
        throw error;
      }
    },
    {
      connection,
      concurrency: 1
    }
  );

  logStep('worker', 'listening', { queue: queueNames.identityIntake });

  return worker;
}
