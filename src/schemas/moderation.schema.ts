import { z } from 'zod';

// ─── Shared ───────────────────────────────────────────────────────────────────

const checklistItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  passed: z.boolean(),
});

// ─── Approve ──────────────────────────────────────────────────────────────────

export const approveSchema = z.object({
  checklist: z.array(checklistItemSchema).optional(),
});

export type ApproveInput = z.infer<typeof approveSchema>;

// ─── Reject ───────────────────────────────────────────────────────────────────

export const rejectSchema = z.object({
  rejection_reason: z.string().min(10).max(1000),
  checklist: z.array(checklistItemSchema).optional(),
});

export type RejectInput = z.infer<typeof rejectSchema>;

// ─── Queue query ──────────────────────────────────────────────────────────────

export const listQueueSchema = z.object({
  type: z.enum(['brand', 'service']).optional(),
});

export type ListQueueInput = z.infer<typeof listQueueSchema>;
