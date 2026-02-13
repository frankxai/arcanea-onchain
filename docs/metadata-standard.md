# Arcanean NFT Metadata Standard

> Specification for NFT metadata in the Arcanea universe.

## Core Attributes

Every Arcanea NFT includes the following on-chain attributes:

| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `element` | enum | Primary elemental affinity | `"fire"`, `"water"`, `"earth"`, `"wind"`, `"void"`, `"spirit"` |
| `gate` | string | Associated Gate of power | `"Foundation"`, `"Flow"`, `"Fire"`, ... `"Source"` |
| `frequency` | number | Gate frequency in Hz | `396`, `417`, `528`, ... `1111` |
| `rank` | enum | Magic rank | `"apprentice"`, `"mage"`, `"master"`, `"archmage"`, `"luminor"` |
| `house` | enum | Academy House | `"lumina"`, `"nero"`, `"pyros"`, `"aqualis"`, `"terra"`, `"ventus"`, `"synthesis"` |
| `guardian` | string | Associated Guardian deity | `"Lyssandria"`, `"Leyla"`, ... `"Shinkami"` |
| `godbeast` | string | Associated Godbeast | `"Kaelith"`, `"Veloura"`, ... `"Amaterasu"` |

## JSON Schema

```json
{
  "name": "Draconia — Guardian of Fire",
  "description": "The Third Guardian, keeper of the Fire Gate at 528 Hz.",
  "image": "ar://...",
  "attributes": [
    { "trait_type": "Element", "value": "Fire" },
    { "trait_type": "Gate", "value": "Fire" },
    { "trait_type": "Frequency", "value": 528 },
    { "trait_type": "Rank", "value": "Luminor" },
    { "trait_type": "Guardian", "value": "Draconia" },
    { "trait_type": "Godbeast", "value": "Draconis" }
  ]
}
```

*Full specification coming in Phase 1.*
