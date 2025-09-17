import { Router } from 'express';
import express from 'express';
import { handleWebhook, handleStatusCallback } from '../services/twilioService';
import { asyncHandler } from '../utils/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

router.use(express.urlencoded({ extended: true }));

router.post('/webhook', asyncHandler(handleWebhook));

router.post('/status', asyncHandler(handleStatusCallback));

router.post('/voice-status', asyncHandler(async (req, res) => {
  logger.info('Voice status callback', { body: req.body });
  res.status(200).send('OK');
}));

router.post('/recording-status', asyncHandler(async (req, res) => {
  logger.info('Recording status callback', { body: req.body });
  res.status(200).send('OK');
}));

export default router;