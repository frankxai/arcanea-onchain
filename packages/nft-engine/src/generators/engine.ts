/**
 * @arcanea/nft-engine — Generation Engine
 *
 * Orchestrates AI image generation through a pluggable provider interface.
 * Handles prompt construction, image generation, and metadata assembly
 * with controlled concurrency for batch operations.
 */

import type {
  Element,
  GenerationRequest,
  GenerationResult,
  Guardian,
  House,
  NFTTier,
} from '../types';
import { buildGuardianPrompt, buildElementStonePrompt } from './prompts';
import { createGuardianMetadata, buildMetadata } from '../metadata/builder';

// ---------------------------------------------------------------------------
// Provider interface — implement this for each AI backend
// ---------------------------------------------------------------------------

export interface AIProvider {
  generateImage(prompt: string, options?: GenerateOptions): Promise<ImageResult>;
}

export interface GenerateOptions {
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
}

export interface ImageResult {
  buffer: Buffer;
  mimeType: string;
  model: string;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class NFTGenerationEngine {
  private readonly provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * Generate a single Guardian NFT — portrait image + full metadata.
   */
  async generateGuardian(
    guardian: Guardian,
    tier: NFTTier = 'epic',
  ): Promise<GenerationResult> {
    const prompt = buildGuardianPrompt(guardian, tier);
    const options: GenerateOptions = {
      width: tier === 'legendary' ? 2048 : 1024,
      height: tier === 'legendary' ? 2048 : 1024,
    };

    const image = await this.provider.generateImage(prompt, options);
    const metadata = createGuardianMetadata(guardian, 'pending-upload', tier);

    return {
      imageBuffer: image.buffer,
      prompt,
      model: image.model,
      metadata,
    };
  }

  /**
   * Generate an Element Stone collectible — one of the five primal stones.
   */
  async generateElementStone(
    element: Element,
    seed?: number,
  ): Promise<GenerationResult> {
    const prompt = buildElementStonePrompt(element);
    const image = await this.provider.generateImage(prompt, {
      width: 1024,
      height: 1024,
      seed,
    });

    const metadata = buildMetadata({
      name: `${capitalize(element)} Stone`,
      description: `An elemental ${element} stone radiating with primal energy. Collect all five Element Stones to unlock the Synthesis Stone.`,
      imageUri: 'pending-upload',
      arcanean: {
        element,
        guardian: getElementGuardian(element),
        rank: 'apprentice',
        house: getElementHouse(element),
        gateLevel: 0,
        frequency: 0,
        tier: 'rare',
        evolves: false,
      },
    });

    return {
      imageBuffer: image.buffer,
      prompt,
      model: image.model,
      metadata,
    };
  }

  /**
   * Generate a batch of NFTs with controlled concurrency.
   *
   * Processes up to `concurrency` requests in parallel to respect
   * provider rate limits.
   */
  async generateBatch(
    requests: GenerationRequest[],
    concurrency: number = 3,
  ): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];

    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((req) => this.generateGuardian(req.guardian, req.tier)),
      );
      results.push(...batchResults);
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getElementGuardian(element: Element): Guardian {
  const map: Record<Element, Guardian> = {
    earth: 'lyssandria',
    water: 'leyla',
    fire: 'draconia',
    wind: 'maylinn',
    void: 'lyria',
  };
  return map[element];
}

function getElementHouse(element: Element): House {
  const map: Record<Element, House> = {
    earth: 'terra',
    water: 'aqualis',
    fire: 'pyros',
    wind: 'ventus',
    void: 'synthesis',
  };
  return map[element];
}
