import crypto from 'node:crypto';
import { Router } from 'express';
import { identityIntakeQueue } from '../../infra/queues/identity-intake.queue';
import { logError, logStep } from '../../infra/logger/logger';
import { eventSchema } from './events.schema';

export function createEventsRouter() {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const event = eventSchema.parse(req.body);
      const correlationId = crypto.randomUUID();
      const jobId = crypto.randomUUID();

      await identityIntakeQueue.add(
        'identity-intake',
        {
          ...event,
          correlationId
        },
        {
          jobId
        }
      );

      logStep('ai-core', 'event queued', {
        caseId: event.caseId,
        caseVersion: event.caseVersion,
        correlationId
      });

      const responsePayload = { accepted: true, correlationId };

      res.status(200).json(responsePayload);
    } catch (error) {
      logError('ai-core', 'event rejected', error);
      res.status(400).json({ error: 'invalid_event' });
    }
  });

  return router;
}
