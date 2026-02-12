# Shards

A Progressive Web App for splitting and reconstructing BIP-39 seed phrases using [SSKR](https://github.com/BlockchainCommons/Research/blob/master/papers/bcr-2020-011-sskr.md) (Sharded Secret Key Reconstruction) and [Gordian Envelope](https://developer.blockchaincommons.com/envelope/).

## Features

- **Split seed phrases** into 2-of-3 or 3-of-5 threshold shares
- **Public notes** - visible on each shard (e.g., wallet name, contact info)
- **Private notes** - encrypted with the seed, only revealed after reconstruction
- **QR code generation** for each shard using UR (Uniform Resource) encoding
- **QR code scanning** to import shards via camera
- **Offline-capable** - works without internet after initial load
- **Mobile-friendly** - responsive design with Bootstrap 5
- **Blockchain Commons** - Uses well-documented specifications from [Blockchain Commons](https://developer.blockchaincommons.com) for long-term viability.

## Envelope Structure

Each shard is a [Gordian Envelope](https://developer.blockchaincommons.com/envelope/) with the following structure:

```
Envelope (shard)
├── Subject: ENCRYPTED
│   └── Envelope (wrapped)
│       └── Envelope (content)
│           ├── Subject: seed entropy (16 or 32 bytes)
│           └── Assertion: NOTE → "private note"
└── Assertion: SSKR_SHARE → share data
```

- The **content envelope** contains the seed entropy and optional private note
- The content is **wrapped** and **encrypted** so both seed entropy and private note are protected
- The **SSKR share** contains a piece of the symmetric key using Shamir's Secret Sharing
- **Public notes** are UI-only - displayed on shard cards and printed on PDFs, but not stored in the envelope

## Technology

- [SolidJS](https://www.solidjs.com/) - Reactive UI framework
- [Vite](https://vitejs.dev/) - Dev server and production build pipeline
- [Bootstrap 5](https://getbootstrap.com/) - UI components
- [BCTS](https://www.npmjs.com/org/bcts) - Blockchain Commons TypeScript libraries
  - `@bcts/envelope` - Gordian Envelope implementation
  - `@bcts/sskr` - Sharded Secret Key Reconstruction
- [@scure/bip39](https://github.com/paulmillr/scure-bip39) - BIP-39 mnemonic handling
- [@paulmillr/qr](https://github.com/paulmillr/qr) - QR code generation
- [qr-scanner](https://github.com/nimiq/qr-scanner) - QR code scanning

## Development

```bash
pnpm install
pnpm run dev
```

## Build

```bash
pnpm run build
pnpm run preview
```

### Creating Shards

1. Select threshold (2-of-3 or 3-of-5)
2. Select seed phrase length (12 or 24 words)
3. Enter your seed phrase or generate a new one
4. Optionally add a public note (visible on each shard)
5. Optionally add a private note (encrypted, revealed after reconstruction)
6. Click "Create Shards"
7. Save each shard's QR code or UR string separately

### Reconstructing Seed

1. Enter the required number of shards (2 for 2-of-3, 3 for 3-of-5)
2. Either paste the UR string or scan the QR code for each shard
3. Click "Reconstruct Seed"
4. View your recovered seed phrase and any notes

## Security Considerations

- The seed phrase and private note are encrypted using ChaCha20-Poly1305
- The encryption key is split using Shamir's Secret Sharing (SSKR)
- Public notes are displayed on cards and PDFs only, not stored in the envelope data
- For maximum security, create and reconstruct shards on an air-gapped device
- Store shards in separate physical locations

## UR Format

Shards are encoded as [Uniform Resources](https://developer.blockchaincommons.com/ur/) (UR) with type `envelope`:

```
ur:envelope/lftpsogdhdfz...
```

This format is designed for reliable QR code transmission and is compatible with other Blockchain Commons tools.

## License

MIT
