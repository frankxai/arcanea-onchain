/**
 * @arcanea/nft-engine — Decentralized Storage
 *
 * Pluggable storage providers for permanent NFT asset hosting.
 * Supports Irys (Arweave) and Pinata (IPFS).
 *
 * Both providers implement the common StorageProvider interface so
 * they can be swapped transparently by the generation pipeline.
 */

import type { StorageResult } from '../types';

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface StorageProvider {
  upload(data: Buffer, contentType: string, tags?: Record<string, string>): Promise<StorageResult>;
  uploadJSON(data: unknown, tags?: Record<string, string>): Promise<StorageResult>;
}

// ---------------------------------------------------------------------------
// Irys (formerly Bundlr) — permanent storage on Arweave
// ---------------------------------------------------------------------------

export class IrysStorage implements StorageProvider {
  private readonly endpoint: string;
  private readonly token: string;

  constructor(config: { endpoint?: string; token: string }) {
    this.endpoint = config.endpoint ?? 'https://node2.irys.xyz';
    this.token = config.token;
  }

  async upload(
    data: Buffer,
    contentType: string,
    tags?: Record<string, string>,
  ): Promise<StorageResult> {
    const allTags: Record<string, string> = {
      'Content-Type': contentType,
      'App-Name': 'Arcanea',
      'App-Version': '1.0.0',
      ...tags,
    };

    // ---------------------------------------------------------------------------
    // Production implementation requires @irys/sdk:
    //
    //   import Irys from '@irys/sdk';
    //   const irys = new Irys({ url: this.endpoint, token: 'solana', key: this.token });
    //   const receipt = await irys.upload(data, {
    //     tags: Object.entries(allTags).map(([name, value]) => ({ name, value })),
    //   });
    //   return {
    //     uri: `ar://${receipt.id}`,
    //     gateway: `https://gateway.irys.xyz/${receipt.id}`,
    //     hash: receipt.id,
    //     size: data.length,
    //   };
    // ---------------------------------------------------------------------------

    void allTags; // suppress unused-variable in stub
    throw new Error(
      'Irys SDK integration required. Install @irys/sdk and configure wallet.',
    );
  }

  async uploadJSON(
    data: unknown,
    tags?: Record<string, string>,
  ): Promise<StorageResult> {
    const json = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(json, 'utf-8');
    return this.upload(buffer, 'application/json', tags);
  }
}

// ---------------------------------------------------------------------------
// Pinata — IPFS pinning service
// ---------------------------------------------------------------------------

export class PinataStorage implements StorageProvider {
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly gateway: string;

  constructor(config: { apiKey: string; secretKey: string; gateway?: string }) {
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.gateway = config.gateway ?? 'https://gateway.pinata.cloud';
  }

  async upload(
    data: Buffer,
    contentType: string,
    tags?: Record<string, string>,
  ): Promise<StorageResult> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(data)], { type: contentType });
    formData.append('file', blob);

    if (tags) {
      formData.append(
        'pinataMetadata',
        JSON.stringify({
          name: tags['name'] ?? 'arcanea-asset',
          keyvalues: tags,
        }),
      );
    }

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        pinata_api_key: this.apiKey,
        pinata_secret_api_key: this.secretKey,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Pinata upload failed: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as { IpfsHash: string; PinSize: number };

    return {
      uri: `ipfs://${result.IpfsHash}`,
      gateway: `${this.gateway}/ipfs/${result.IpfsHash}`,
      hash: result.IpfsHash,
      size: result.PinSize,
    };
  }

  async uploadJSON(
    data: unknown,
    tags?: Record<string, string>,
  ): Promise<StorageResult> {
    const json = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(json, 'utf-8');
    return this.upload(buffer, 'application/json', {
      ...tags,
      name: tags?.['name'] ?? 'metadata.json',
    });
  }
}
