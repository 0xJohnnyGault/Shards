import * as bip39 from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { Envelope, NOTE } from '@bcts/envelope'

export function reconstructShares(shareTexts) {
	const populatedShares = shareTexts.filter((text) => text.trim().length > 0)
	if (populatedShares.length < 2) {
		throw new Error('Please enter at least 2 shares')
	}

	const shareEnvelopes = populatedShares.map((text) => {
		const trimmed = text.trim().toLowerCase()
		return Envelope.fromUrString(trimmed)
	})

	const wrapped = Envelope.sskrJoin(shareEnvelopes)
	const inner = wrapped.unwrap()
	const subjectEnvelope = inner.subject()

	let recoveredMnemonic = null
	let recoveredSecretText = null
	let recoveredPrivateNote = null

	try {
		const entropy = subjectEnvelope.extractBytes()
		recoveredMnemonic = bip39.entropyToMnemonic(entropy, wordlist)
		entropy.fill(0)

		try {
			const privateNoteObj = inner.objectForPredicate(NOTE)
			if (privateNoteObj) {
				recoveredPrivateNote = privateNoteObj.extractString()
			}
		} catch {
			// No private note
		}
	} catch {
		// No seed entropy: the subject is secret text.
		recoveredSecretText = subjectEnvelope.extractString()
	}

	return {
		mnemonic: recoveredMnemonic,
		secretText: recoveredSecretText,
		privateNote: recoveredPrivateNote,
	}
}
