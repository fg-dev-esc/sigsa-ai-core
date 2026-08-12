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
        logStep('worker', 'job started', {
          caseId: job.data.caseId,
          jobId: job.id,
          correlationId: job.data.correlationId
        });

        await processor.execute(job.data);

        logStep('worker', 'job completed', {
          caseId: job.data.caseId,
          jobId: job.id,
          correlationId: job.data.correlationId
        });
      } catch (error) {
        logError('worker', 'job failed', error, {
          caseId: job.data.caseId,
          jobId: job.id,
          correlationId: job.data.correlationId
        });
        throw error;
      }
    },
    {
      connection,
      concurrency: 1,
      limiter: {
        max: 1,
        duration: 10000
      }
    }
  );

  worker.on('failed', (job, error) => {
    logError('worker', 'failed event', error, { jobId: job?.id });
  });

  logStep('worker', 'listening', { queue: queueNames.identityIntake });

  return worker;
}
