import { z } from 'zod';

// Invite a USO user into a branch team (owner only).
export const inviteToTeamSchema = z.object({
  target_user_id: z.string().cuid('Invalid user id'),
});

export type InviteToTeamInput = z.infer<typeof inviteToTeamSchema>;
