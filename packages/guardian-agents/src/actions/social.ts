/**
 * @arcanea/guardian-agents — Social Actions
 *
 * Social engagement actions that Guardian agents use to interact
 * with the Arcanea community across platforms. Each action is
 * flavored by the Guardian's personality and posting style.
 */

import type { AgentAction, ActionResult } from '../types';

// ---------------------------------------------------------------------------
// Action Definitions
// ---------------------------------------------------------------------------

export const postUpdate: AgentAction = {
  name: 'post_update',
  description:
    'Post a social update to one or more platforms. The content is shaped by the Guardian\'s voice and posting style — Aiyami posts rarely with cosmic weight, Maylinn posts warmly and frequently, Draconia posts with commanding urgency.',
  parameters: {
    content: {
      type: 'string',
      required: true,
      description: 'The text content of the post',
    },
    platforms: {
      type: 'array',
      required: false,
      description: 'Target platforms (default: all configured for the Guardian)',
    },
    mediaUrl: {
      type: 'string',
      required: false,
      description: 'URL of attached media (image, video, etc.)',
    },
    replyTo: {
      type: 'string',
      required: false,
      description: 'ID of a post to reply to (creates a thread)',
    },
    scheduledAt: {
      type: 'number',
      required: false,
      description: 'Unix timestamp to schedule the post for (default: immediate)',
    },
    tags: {
      type: 'array',
      required: false,
      description: 'Hashtags or topic tags to include',
    },
  },
  handler: async (params: Record<string, unknown>): Promise<ActionResult> => {
    const {
      content,
      platforms,
      mediaUrl,
      replyTo,
      scheduledAt,
      tags,
    } = params;

    const targetPlatforms = (platforms as string[]) ?? ['twitter', 'farcaster'];

    console.log(
      `[Social] Posting to ${targetPlatforms.join(', ')}: "${(content as string).slice(0, 80)}..."`,
    );

    return {
      success: true,
      data: {
        postId: `post_${Date.now()}`,
        content,
        platforms: targetPlatforms,
        mediaUrl: mediaUrl ?? null,
        replyTo: replyTo ?? null,
        scheduledAt: scheduledAt ?? null,
        tags: tags ?? [],
        publishedAt: scheduledAt ? null : Date.now(),
        status: scheduledAt ? 'scheduled' : 'published',
      },
    };
  },
};

export const engageCommunity: AgentAction = {
  name: 'engage_community',
  description:
    'Engage with the community through likes, replies, reposts, or direct messages. Each Guardian has a distinct engagement type — Lyria offers oracle-like guidance, Ino matchmakes collaborators, Alera educates on authenticity.',
  parameters: {
    engagementType: {
      type: 'string',
      required: true,
      description: 'Type of engagement: "reply", "like", "repost", "quote", "dm"',
    },
    targetPostId: {
      type: 'string',
      required: true,
      description: 'The post or user to engage with',
    },
    content: {
      type: 'string',
      required: false,
      description: 'Content for replies, quotes, or DMs',
    },
    platform: {
      type: 'string',
      required: true,
      description: 'The platform where engagement occurs',
    },
    sentiment: {
      type: 'string',
      required: false,
      description: 'Intended sentiment: "supportive", "educational", "celebratory", "analytical"',
    },
  },
  handler: async (params: Record<string, unknown>): Promise<ActionResult> => {
    const { engagementType, targetPostId, content, platform, sentiment } = params;

    console.log(
      `[Social] ${engagementType} on ${platform} → ${targetPostId}${content ? `: "${(content as string).slice(0, 60)}..."` : ''}`,
    );

    return {
      success: true,
      data: {
        engagementId: `engage_${Date.now()}`,
        type: engagementType,
        targetPostId,
        content: content ?? null,
        platform,
        sentiment: sentiment ?? 'supportive',
        executedAt: Date.now(),
      },
    };
  },
};

export const announceAuction: AgentAction = {
  name: 'announce_auction',
  description:
    'Create a multi-platform announcement for an upcoming or active auction. Generates excitement while maintaining the Guardian\'s authentic voice. Draconia announces like a battle cry; Aiyami announces like a sacred ceremony.',
  parameters: {
    auctionId: {
      type: 'string',
      required: true,
      description: 'The auction to announce',
    },
    itemName: {
      type: 'string',
      required: true,
      description: 'Human-readable name of the auctioned item',
    },
    creatorName: {
      type: 'string',
      required: true,
      description: 'Name of the creator',
    },
    startingPrice: {
      type: 'number',
      required: true,
      description: 'Starting bid in SOL',
    },
    endsAt: {
      type: 'number',
      required: true,
      description: 'Unix timestamp when the auction ends',
    },
    imageUrl: {
      type: 'string',
      required: false,
      description: 'Preview image URL for the item',
    },
    platforms: {
      type: 'array',
      required: false,
      description: 'Target platforms for the announcement',
    },
  },
  handler: async (params: Record<string, unknown>): Promise<ActionResult> => {
    const {
      auctionId,
      itemName,
      creatorName,
      startingPrice,
      endsAt,
      imageUrl,
      platforms,
    } = params;

    const targetPlatforms = (platforms as string[]) ?? ['twitter', 'farcaster', 'discord'];
    const hoursRemaining = Math.max(
      0,
      Math.round(((endsAt as number) - Date.now()) / 3_600_000),
    );

    console.log(
      `[Social] Announcing auction: "${itemName}" by ${creatorName} — ${startingPrice} SOL, ${hoursRemaining}h remaining`,
    );

    return {
      success: true,
      data: {
        announcementId: `announce_${Date.now()}`,
        auctionId,
        itemName,
        creatorName,
        startingPrice,
        hoursRemaining,
        imageUrl: imageUrl ?? null,
        platforms: targetPlatforms,
        publishedAt: Date.now(),
      },
    };
  },
};

export const celebrateCreator: AgentAction = {
  name: 'celebrate_creator',
  description:
    'Publicly celebrate a creator milestone — first sale, collection completion, community recognition, or legendary achievement. Each Guardian celebrates differently: Maylinn with warmth, Draconia with fierce respect, Lyssandria with quiet acknowledgment.',
  parameters: {
    creatorAddress: {
      type: 'string',
      required: true,
      description: 'The creator\'s wallet address or username',
    },
    creatorName: {
      type: 'string',
      required: true,
      description: 'Human-readable creator name',
    },
    milestone: {
      type: 'string',
      required: true,
      description: 'The milestone being celebrated (e.g., "first_sale", "100_sales", "legendary_drop")',
    },
    details: {
      type: 'string',
      required: false,
      description: 'Additional context about the achievement',
    },
    platforms: {
      type: 'array',
      required: false,
      description: 'Target platforms for the celebration',
    },
  },
  handler: async (params: Record<string, unknown>): Promise<ActionResult> => {
    const { creatorAddress, creatorName, milestone, details, platforms } = params;

    const targetPlatforms = (platforms as string[]) ?? ['twitter', 'farcaster', 'discord'];

    console.log(
      `[Social] Celebrating ${creatorName} for ${milestone}${details ? ` — ${details}` : ''}`,
    );

    return {
      success: true,
      data: {
        celebrationId: `celebrate_${Date.now()}`,
        creatorAddress,
        creatorName,
        milestone,
        details: details ?? null,
        platforms: targetPlatforms,
        publishedAt: Date.now(),
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Action Registry
// ---------------------------------------------------------------------------

/**
 * Complete registry of social actions available to Guardian agents.
 */
export const SOCIAL_ACTIONS = {
  postUpdate,
  engageCommunity,
  announceAuction,
  celebrateCreator,
} as const;

/**
 * Get a social action by its machine-readable name.
 */
export function getSocialAction(name: string): AgentAction | undefined {
  return Object.values(SOCIAL_ACTIONS).find((action) => action.name === name);
}

/**
 * Get all social action names.
 */
export function getSocialActionNames(): string[] {
  return Object.values(SOCIAL_ACTIONS).map((action) => action.name);
}
