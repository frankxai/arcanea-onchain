# Metadata Schema

Status: implementation contract
Last updated: 2026-06-27

Use IPFS or Arweave for immutable metadata once a deployment is approved.
Local JSON is acceptable for tests and testnet.

## Software License Token

```json
{
  "schema": "arcanea.software-license.v1",
  "assetId": "starlight.software.claw-pack.v1",
  "name": "",
  "description": "",
  "image": "",
  "version": "",
  "developer": "",
  "licenseClass": "personal | team | agency | enterprise | partner",
  "termsHash": "",
  "manifestHash": "",
  "supportBoundary": "",
  "trademarkGrant": false,
  "commercialUse": false,
  "trainingUse": false,
  "attributes": []
}
```

## Creative Provenance Token

```json
{
  "schema": "arcanea.creative-provenance.v1",
  "assetId": "arcanea.art.alera-cover.v1",
  "name": "",
  "description": "",
  "image": "",
  "creator": "",
  "owner": "",
  "aiDisclosure": "none | assisted | generated | mixed | unknown",
  "rightsHash": "",
  "sourceHash": "",
  "termsHash": "",
  "commercialUse": false,
  "derivativesAllowed": false,
  "revenueRights": false,
  "attributes": []
}
```

## Rule

If `revenueRights` is true, the asset is blocked from public minting until legal
review is complete and recorded in the deployment manifest.

