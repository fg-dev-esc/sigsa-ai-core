import { Worker } from 'bullmq';
import { logError, logStep } from '../infra/logger/logger';
import { createRedisConnection } from '../infra/redis/redis.client';
import { queueNames } from '../infra/queues/queue-names';
import { ProcessIdentityIntakeUseCase } from '../features/identity-intake/process-identity-intake.usecase';
import type { IdentityIntakeJob } from '../features/identity-intake/identity-intake.job';

const processor = new ProcessIdentityIntakeUseCase();
const connection = createRedisConnection();

const worker = new Worker<IdentityIntakeJob, void, string>(
  queueNames.identityIntake,
  async (job) => {
    try {
      logStep('worker', 'job started', {
        caseId: job.data.caseId,
        jobId: job.id,
        caseVersion: job.data.caseVersion,
        correlationId: job.data.correlationId
      });

      await processor.execute(job.data);

      logStep('worker', 'job completed', {
        caseId: job.data.caseId,
        jobId: job.id,
        caseVersion: job.data.caseVersion,
        correlationId: job.data.correlationId
      });
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

worker.on('failed', (job, error) => {
  logError('worker', 'failed event', error, { jobId: job?.id });
});

async function shutdown() {
  await worker.close();
}

process.on('SIGINT', () => {
  shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  shutdown().finally(() => process.exit(0));
});

logStep('worker', 'listening', { queue: queueNames.identityIntake });
